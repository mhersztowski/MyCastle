# Archiwizacja homelaba → Google Drive

Nocna kopia zapasowa maszyny `homelab1ubuntu` (192.168.0.89) i konfiguracji
Proxmoksa (192.168.0.100) do Google Drive, oparta na **restic** (deduplikacja,
szyfrowanie, snapshoty) z **rclone** jako transportem.

## Dlaczego tak

**restic, nie zwykłe tarballe w Drive.** Ta sama treść wysyłana co noc zajęłaby
w Drive tyle razy więcej miejsca, ile trzymamy dni historii. restic dzieli dane
na bloki i wysyła tylko te, których jeszcze nie ma — drugi i każdy kolejny
snapshot to praktycznie sam przyrost. Przy okazji wszystko jest szyfrowane
*przed* opuszczeniem maszyny, więc Google trzyma nieczytelne paczki.

**Zrzuty baz, nie kopie katalogów PGDATA.** Kopia plików działającego Postgresa
robiona w locie bywa nie do odtworzenia (część stanu siedzi w buforach i WAL-u),
a przy okazji zmienia się co do bajta między przebiegami i psuje deduplikację.
Dlatego katalogi danych baz są w wykluczeniach, a zamiast nich jedzie
`pg_dumpall`.

**Nie archiwizujemy tego, co się odtwarza jedną komendą.** Modele Ollamy (23 GB),
modele Whispera, cache ML Immicha i transkodowania Jellyfina pobiorą się same.
Miejsce w Drive jest na dane, których nikt nie odtworzy — zdjęcia, bazy,
konfiguracja.

**Konfiguracja Proxmoksa, bez obrazów dysków.** `/etc/pve` i inwentarz maszyn
wirtualnych ważą megabajty i pozwalają odbudować host. Obrazy dysków to setki
gigabajtów — ich miejsce jest na lokalnym magazynie `vzdump`, nie w Drive.

## Co wchodzi do archiwum

| Obszar | Zawartość |
|---|---|
| Bazy danych | `pg_dumpall` z Coolify, Immicha, Nextclouda, n8n, Authentika |
| Coolify | `/data/coolify` — aplikacje, usługi, proxy, klucze SSH, `.env` |
| Dane aplikacji | `/opt/mycastle-data`, `/media/photos` (Immich), wolumeny Dockera |
| Projekty | `/data/projects`, `/data/users`, `/data/symbols`, `/data/footprints` |
| System | `/etc`, `/root`, `/home`, lista pakietów, inwentarz Dockera, LVM, sieć, zapora |
| Proxmox | `/etc/pve` (18 plików: konfiguracje VM, `storage.cfg`, `user.cfg`, klucze CA), `/etc/network/interfaces`, `fstab`, źródła apt, spis VM/LXC, stan magazynów |

Poza archiwum świadomie: modele Ollamy (23 GB) i Whispera, cache ML Immicha,
modele embeddingów Open WebUI (1,1 GB), okładki Jellyfina pobierane z TMDB
(1,4 GB), katalogi `PGDATA`, `/boot`, obrazy dysków Proxmoksa.
Redisy też nie — trzymają kolejki i cache, nie stan, który trzeba przeżyć.

## Instalacja

```bash
# z maszyny deweloperskiej
rsync -a ops/homelab-backup/ marcin@192.168.0.89:/tmp/homelab-backup/
ssh marcin@192.168.0.89 'sudo /tmp/homelab-backup/install.sh'

# na serwerze — podłączenie Dysku (wymaga przeglądarki na Twoim komputerze)
ssh -t marcin@192.168.0.89 'sudo /opt/homelab-backup/setup-gdrive.sh'

# uzupełnij RESTIC_REPOSITORY (i PVE_HOST, jeśli Proxmox ma być objęty)
ssh -t marcin@192.168.0.89 'sudo nano /etc/homelab-backup/backup.env'

# pierwszy przebieg
ssh marcin@192.168.0.89 'sudo systemctl start homelab-backup.service'
ssh marcin@192.168.0.89 'journalctl -u homelab-backup -f'
```

Ponowne uruchomienie `install.sh` po zmianie skryptów jest bezpieczne — nie
rusza `backup.env` ani hasła repozytorium.

### Hasło repozytorium

`install.sh` generuje je raz, do `/etc/homelab-backup/restic-password`.
**Zapisz je poza tą maszyną.** Bez niego archiwum jest nieodwracalnie
nieczytelne — także dla Ciebie. Utrata dysku razem z hasłem znaczy utratę
backupu, mimo że dane leżą bezpiecznie w Drive.

### Dostęp do Proxmoksa

Skonfigurowany: serwer backupu ma własny klucz `/etc/homelab-backup/pve_ed25519`,
a jego część publiczna leży w `/root/.ssh/authorized_keys` na 192.168.0.100
z ograniczeniami `restrict,from="192.168.0.89"` — klucz działa wyłącznie
z maszyny backupu i nie pozwala na tunelowanie ani przekazywanie agenta.

Odtworzenie tego dostępu po przeinstalowaniu PVE:

```bash
ssh marcin@192.168.0.89 'sudo cat /etc/homelab-backup/pve_ed25519.pub'
# wpis w /root/.ssh/authorized_keys na hoście PVE, poprzedzony:
#   restrict,from="192.168.0.89"
```

**Archiwum zawiera klucze prywatne klastra** — `/etc/pve/priv` niesie klucz CA
i klucz uwierzytelniania Proxmoksa. To jeden z powodów, dla których szyfrowanie
repozytorium nie jest tu opcją do rozważenia.

## Harmonogram

| Kiedy | Co |
|---|---|
| Codziennie 02:30 (±15 min) | Pełny przebieg: zrzuty, inwentarz, snapshot, retencja |
| Niedziela | Dodatkowo `prune` — fizyczne zwolnienie miejsca po wygasłych snapshotach |
| Poniedziałek 05:30 | `restic check` — weryfikacja struktury repozytorium |
| Pierwszy tydzień miesiąca | Weryfikacja z pobraniem 2% danych |

Retencja: 14 dziennych, 8 tygodniowych, 12 miesięcznych, 3 roczne.

`prune` idzie raz w tygodniu, bo przepisuje paczki w repozytorium — na dysku
zdalnym to najdroższa operacja w całym cyklu.

## Sprawdzenie stanu

```bash
systemctl list-timers 'homelab-backup*'
cat /var/lib/homelab-backup/last-status     # wynik ostatniego przebiegu
cat /var/lib/homelab-backup/last-check      # wynik ostatniej weryfikacji
journalctl -u homelab-backup --since yesterday
ls -t /var/log/homelab-backup/ | head
```

## Odtwarzanie

Pomocnik `restore.sh` opakowuje restica — samo `restore.sh` bez argumentów
wypisuje ściągawkę.

```bash
sudo /opt/homelab-backup/restore.sh snapshots                    # punkty w czasie
sudo /opt/homelab-backup/restore.sh get latest /opt/mycastle-data
sudo /opt/homelab-backup/restore.sh get latest /data/coolify /var/tmp/odzysk
sudo /opt/homelab-backup/restore.sh mount /mnt/backup             # przeglądanie jak dysku
sudo /opt/homelab-backup/restore.sh db-list
sudo /opt/homelab-backup/restore.sh db-restore coolify-db.sql coolify-db --yes
```

`db-restore` **nadpisuje** bazy w kontenerze — zrzuty z `pg_dumpall` niosą
`DROP … IF EXISTS`. Po wgraniu zrestartuj aplikacje korzystające z tej bazy.

Bazę Immicha odtwarzaj do kontenera z **tym samym obrazem** — zrzut odwołuje się
do rozszerzeń (VectorChord/pgvecto.rs), których zwykły Postgres nie ma.

### Odtworzenie na obcej maszynie

Archiwum jest samowystarczalne: potrzebny jest tylko restic, rclone z dostępem
do Dysku i hasło repozytorium.

```bash
export RESTIC_REPOSITORY="rclone:gdrive:Backups/homelab1ubuntu"
export RESTIC_PASSWORD="…"
restic snapshots
restic restore latest --target /odzysk
```

Inwentarz systemu (`system/`) w każdym snapshocie mówi, co na tej maszynie
stało: lista pakietów, kontenery z pełnym `docker inspect`, układ LVM, sieć
i reguły zapory.

## Pułapki, które już nas kosztowały

**Usługa systemd startuje z pustym `$HOME`.** restic bez `$HOME` i bez
`$XDG_CACHE_HOME` nie potrafi zlokalizować katalogu cache i kończy błędem
*każde* polecenie — także zwykłe sprawdzenie, czy repozytorium istnieje.
Objawia się to jako „repozytorium nie istnieje" przy repozytorium, które jest
na miejscu. Stąd jawny `RESTIC_CACHE_DIR` w `backup.env` i `Environment=HOME=/root`
w jednostkach.

**`pg_dumpall` kończy zrzut inną stopką niż `pg_dump`** — „PostgreSQL database
**cluster** dump complete". Weryfikacja szukająca stopki `pg_dump` odrzuca
komplet poprawnych zrzutów.

**`POSTGRES_USER` nie znaczy „to jest serwer bazy".** Coolify wstrzykuje tę
zmienną całemu stackowi — mają ją Redisy i frontendy. Serwer poznaje się po
`PGDATA` i obecności `pg_dumpall`.

**Moduły w `collect/` to osobne procesy, nie funkcje.** Zmienna z `backup.env`
bez `export` do nich nie dociera — moduł widzi pustą wartość, pomija swoją pracę
i melduje sukces. Tak właśnie moduł Proxmoksa „pomijał się z powodu pustego
`PVE_HOST`" przy `PVE_HOST` ustawionym w konfiguracji. Z tego samego powodu
`SKIP_DB_CONTAINERS` jest listą słów, a nie tablicą: tablicy bash przez granicę
procesu nie przekaże.

**`tar --exclude=".*"` wyklucza cały katalog.** Wzorzec dopasowuje także samo
`.`, czyli korzeń archiwum — `tar -C /etc/pve --exclude=".*" -cf - .` przysyła
zero plików i kończy się kodem 0. Wzorzec musi wymagać znaku po kropce
(`--anchored --exclude="./.?*"`), a moduł dodatkowo sprawdza, czy cokolwiek
przyszło.

**Ślepe `restic init` przy nieosiągalnym repozytorium jest groźniejsze niż
błąd.** Literówka w adresie albo zerwane połączenie z Dyskiem wyglądają dla
restica tak samo jak brak repozytorium; automatyczna inicjalizacja założyłaby
nowe, puste repozytorium obok prawdziwego, a archiwizacja meldowałaby sukces
przez miesiące. Skrypt inicjalizuje wyłącznie wtedy, gdy restic wprost mówi, że
w tym miejscu nie ma repozytorium.

## Utrzymanie

Zmiana zakresu archiwizacji to `BACKUP_PATHS` w `/etc/homelab-backup/backup.env`;
wykluczenia to `excludes.txt` w tym repozytorium (instalator je nadpisuje, więc
edytuj tutaj, nie na serwerze).

Jeśli kiedyś dojdzie osobny dysk zamontowany pod archiwizowaną ścieżką — pamiętaj
o `--one-file-system` w `backup.sh`: przebieg zatrzyma się na granicy systemu
plików i zawartość nowego dysku po cichu nie wejdzie do snapshotu.
