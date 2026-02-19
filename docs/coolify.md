Coolify 4.0.0-beta może nie obsługiwać dobrze Docker Compose profiles. Lepsze podejście: osobne deploymenty w Coolify dla każdej aplikacji.

MyCastle (backend + web) — Docker Compose
Projects → Twój projekt → + New → Docker Compose
Source: GitHub → wybierz repo
Branch: main
Compose file: docker-compose.yml (domyślne)
Po wykryciu serwisów:
web → przypisz domenę (np. mycastle.twojadomena.com), port 80
backend → bez domeny (internal), Coolify automatycznie podłączy go do sieci z web
Volumes → mycastle-data zamapuj na persistent storage
Ale żeby to działało czysto, usuńmy profiles z mycastle serwisów (Coolify może je zignorować albo nie uruchomić nic):

Write docker-compose.yml
30 lines
services:
  backend:
    build:
      context: .
      dockerfile: app/mycastle-backend/Dockerfile
    environment:
      - PORT=1894
      - ROOT_DIR=/data
    volumes:
      - mycastle-data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:1894/ocr/status').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3

  web:
    build:
      context: .
      dockerfile: app/mycastle-web/Dockerfile
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  mycastle-data:
Demo Scene 3D — osobny resource (Dockerfile)
Projects → Twój projekt → + New → Dockerfile
Source: GitHub → to samo repo
Branch: main
Dockerfile location: app/demo-scene-3d/Dockerfile
Build context: / (root repo — bo Dockerfile kopiuje packages/)
Przypisz domenę (np. scene3d.twojadomena.com), port 80
Podsumowanie w Coolify:

Resource	Typ	Co robi
MyCastle	Docker Compose	backend (internal) + web (domena)
Demo Scene 3D	Dockerfile	standalone app (domena)
Każdy resource deployuje się niezależnie. Jak dodasz nową appkę do app/, tworzysz nowy Coolify resource → Dockerfile → wskazujesz na jej Dockerfile.

W Coolify port ustawiasz w konfiguracji serwisu, nie w .env aplikacji. Demo-scene-3d to statyczna aplikacja (nginx) — nie potrzebuje żadnych zmiennych środowiskowych.

Coolify: w ustawieniach resource'a ustawiasz "Ports Exposes" np. 80 (port wewnętrzny kontenera) i przypisujesz domenę. Traefik routuje ruch do kontenera. Nie ma znaczenia jaki port "publiczny" chcesz — Coolify mapuje domenę → kontener:80.

Dev (Vite): port ustawiasz w vite.config.ts:

server: { port: 1897 }


Prawidłowy flow
+ New Resource (w projekcie)
Nie wybieraj "Docker Compose" na tym etapie! — zamiast tego wybierz źródło kodu:
Public Repository — jeśli repo jest publiczne, wklejasz URL
GitHub App — jeśli repo jest prywatne (wymaga wcześniejszej konfiguracji w Sources)
Wklej URL repo (np. https://github.com/twoj-user/mycastle)
Coolify domyślnie ustawi build pack na Nixpacks — kliknij na to i zmień na Docker Compose
Skonfiguruj:
Branch: main
Base Directory: /
Docker Compose Location: /docker-compose.yml
Kliknij Continue
Jeśli repo jest prywatne
Najpierw musisz dodać GitHub source:

Sources (lewe menu) → + Add
Wybierz GitHub App — Coolify przeprowadzi Cię przez OAuth flow
Dopiero potem wracasz do tworzenia resource'a i wybierasz ten GitHub App jako źródło
Webhook
To co widzisz (webhook) to prawdopodobnie opcja raw Docker Compose (wklejasz YAML ręcznie) — wtedy webhook służy do triggerowania deploymentu z CI/CD. Tego nie chcesz. Chcesz git-based deployment, gdzie Coolify sam klonuje repo.

Jeszcze jedno — usuń ports z docker-compose.yml
Coolify sam zarządza portami przez Traefik. Mając ports: w compose, może być konflikt. Chcesz żebym usunął sekcję ports z pliku?

Sources:
