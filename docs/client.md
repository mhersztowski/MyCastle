# Client Agent

Python MQTT agent uruchamiany na komputerze użytkownika (Windows/Linux). Łączy się z brokerem MyCastle, obsługuje komendy systemowe i udostępnia lokalny katalog jako VFS przez MQTT.

## Lokalizacja

```
app/client/
├── agent.py          # ClientAgent — główna klasa agenta
├── config.py         # Konfiguracja (MQTT, topics, ścieżki)
├── extensions/
│   ├── __init__.py
│   └── vfs.py        # VfsExtension — VFS przez MQTT
├── data/             # Katalog VFS root (domyślny)
├── operations/       # Handlery komend (system, process, shell, …)
└── requirements.txt
```

## Uruchomienie

Pierwsze uruchomienie (tworzy venv):

```bash
cd app/client
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python agent.py
```

Kolejne uruchomienia:

```bash
cd app/client
source .venv/bin/activate
python agent.py
```

Agent połączy się z brokerem MQTT i zasubskrybuje tematy poleceń oraz VFS.

## Konfiguracja

Przez zmienne środowiskowe (lub plik `.env`):

| Zmienna               | Domyślna         | Opis                                 |
|-----------------------|------------------|--------------------------------------|
| `MQTT_BROKER_HOST`    | `localhost`      | Adres brokera MQTT                   |
| `MQTT_BROKER_PORT`    | `1884`           | Port (TCP)                           |
| `MQTT_TRANSPORT`      | `tcp`            | `tcp` lub `websockets`               |
| `MQTT_WS_PATH`        | `/mqtt`          | Ścieżka WebSocket (tylko websockets) |
| `MQTT_USER`           | `admin`          | Nazwa użytkownika MyCastle           |
| `MQTT_DEVICE`         | `desktop`        | Nazwa urządzenia                     |
| `MQTT_CLIENT_ID`      | auto             | MQTT client ID                       |
| `HEARTBEAT_INTERVAL`  | `30`             | Interwał heartbeat (sekundy)         |
| `DATA_DIR`            | `app/client/data`| Katalog główny VFS                   |
| `SHELL_COMMAND_TIMEOUT` | `30`           | Maks. czas wykonania komendy (s)     |
| `SHELL_MAX_OUTPUT_SIZE` | `65536`        | Maks. rozmiar wyjścia komendy (B)    |

## Topiki MQTT

Prefix: `minis/{MQTT_USER}/{MQTT_DEVICE}`

| Topik                          | Kierunek        | Opis                    |
|--------------------------------|-----------------|-------------------------|
| `…/heartbeat`                  | agent → serwer  | Heartbeat `{uptime}`    |
| `…/command`                    | serwer → agent  | Komenda `{id, name, payload}` |
| `…/command/ack`                | agent → serwer  | ACK `{id, status, reason?}` |
| `…/ext/vfs/req`                | serwer → agent  | Żądanie VFS             |
| `…/ext/vfs/res`                | agent → serwer  | Odpowiedź VFS           |

## Rozszerzenie VFS

Agent udostępnia katalog `DATA_DIR` jako wirtualny system plików widoczny w MyCastle pod ścieżką `/devices/{deviceName}/`.

### Obsługiwane operacje

| Operacja    | Opis                                          |
|-------------|-----------------------------------------------|
| `stat`      | Metadane pliku/katalogu (type, size, mtime)   |
| `readdir`   | Lista zawartości katalogu                     |
| `readfile`  | Odczyt pliku (dane w base64)                  |
| `writefile` | Zapis pliku (dane w base64, opcje create/overwrite) |
| `delete`    | Usunięcie pliku lub katalogu (opcja recursive)|
| `rename`    | Zmiana nazwy/przeniesienie (opcja overwrite)  |
| `mkdir`     | Tworzenie katalogu                            |

### Bezpieczeństwo

`_resolve(path)` używa `os.path.realpath` + sprawdzenia `startswith(root_dir)` — uniemożliwia directory traversal poza `DATA_DIR`.

## Testowanie

Opublikuj na `minis/{user}/{device}/ext/vfs/req`:

```json
{ "id": "test-1", "op": "readdir", "path": "/" }
```

Odpowiedź pojawi się na `minis/{user}/{device}/ext/vfs/res`:

```json
{ "id": "test-1", "ok": true, "data": { "entries": [] } }
```
