# 0008. JWT + API Key dual authentication

Data: 2024-05-01
Status: Accepted

## Kontekst

Minis Platform obsługuje dwa typy klientów:
1. **Przeglądarkowi użytkownicy** — logują się przez UI (`/auth/login`), sesja krótka (1-24h)
2. **Programatyczni klienci** — IoT devices, skrypty, automatyzacje — potrzebują długoterminowego dostępu bez hasła

## Rozważane opcje

- **JWT + API Key** — dual auth, JWT dla sesji, API keys dla automatyzacji
- **JWT only** — problematyczny dla IoT (wymaga refresh, krótki TTL)
- **Session cookies** — CSRF vulnerability, nie działa dla IoT/MQTT
- **OAuth 2.0** — overkill dla single-tenant systemu, złożona implementacja
- **Basic Auth** — niezabezpieczone, nie nadaje się do produkcji bez HTTPS

## Decyzja

Wybrana opcja: **JWT + API Key dual authentication** przez `checkAuth()` middleware, ponieważ:

- **JWT** (`JwtService.sign/verify`) — logowanie przez `/api/auth/login` → `{ token, user }`. Krótki TTL, `AuthTokenPayload` w kontekście requestu
- **API Key** (`ApiKeyService`) — `minis_` prefix, SHA-256 hash w storage, per-user, CRUD przez `/api/users/:userName/api-keys`. Długoterminowe, bezpieczne dla automatyzacji
- **MQTT auth** — `MqttServer.setAuthenticate()` akceptuje JWT (Bearer) lub API key jako password
- `checkAuth(req)` sprawdza `Authorization: Bearer <token>` — transparentnie dla obu typów
- `isAdmin` w `AuthTokenPayload` — route guard dla admin endpoints

## Konsekwencje

### Pozytywne
- IoT devices używają API key zamiast hasła — rotacja bez zmiany konfiguracji urządzeń
- Impersonacja (`startImpersonating()`) działa wyłącznie przez JWT — nie przez API key
- Automatyczna migracja plaintext haseł do bcrypt przy logowaniu
- API keys mają prefix `minis_` — łatwa identyfikacja w logach

### Negatywne / kompromisy
- Brak refresh tokenów — JWT wygasa, użytkownik musi się ponownie zalogować
- API keys przechowywane w JSON files (`data/`) — brak centralnej bazy auth
- MQTT CONNECT `username/password` vs `Bearer token` — niestandardowe dla IoT libraries (niektóre nie wspierają)
- Brak revoke JWT przed ekspiry — czarna lista wymagana przy wrażliwych usecases
