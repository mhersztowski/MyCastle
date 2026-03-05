# C4 Level 1 — System Context

Diagram pokazuje MyCastle jako system w kontekście zewnętrznych aktorów i systemów.

```mermaid
C4Context
    title System Context — MyCastle Ecosystem

    Person(user, "Użytkownik", "Zarządza zadaniami, projektami,\nkalendarzem, urządzeniami IoT")
    Person(admin, "Administrator", "Zarządza użytkownikami,\ndefinicjami urządzeń/modułów")
    Person(iotDevice, "Urządzenie IoT", "ESP32/Arduino z firmware\npublikujące telemetrię MQTT")

    System_Boundary(mycastle, "MyCastle Ecosystem") {
        System(mycastlePlatform, "MyCastle Platform", "Zarządzanie informacjami osobistymi:\nosoby, zadania, projekty, kalendarz,\nzakupy, automate, AI assistant")
        System(minisPlatform, "Minis Platform", "Platforma IoT: zarządzanie\nurządzeniami, telemetria, alerty,\nzdalne programowanie Arduino/uPython")
    }

    System_Ext(openai, "OpenAI API", "GPT-4 do AI assistant\ni skanowania paragonów")
    System_Ext(anthropic, "Anthropic API", "Claude do AI assistant")
    System_Ext(ollama, "Ollama", "Lokalne modele LLM\n(self-hosted)")
    System_Ext(github, "GitHub", "Repozytoria plików\n(VFS GitHubFS provider)")
    System_Ext(arduinoCli, "Arduino CLI", "Kompilacja i upload\nfirmware (local/Docker)")

    Rel(user, mycastlePlatform, "Używa", "HTTPS / WebSocket")
    Rel(user, minisPlatform, "Używa", "HTTPS / WebSocket")
    Rel(admin, minisPlatform, "Administruje", "HTTPS")
    Rel(iotDevice, minisPlatform, "Wysyła telemetrię\nOdbiera komendy", "MQTT over WebSocket")

    Rel(mycastlePlatform, openai, "Wywołuje", "HTTPS REST API")
    Rel(mycastlePlatform, anthropic, "Wywołuje", "HTTPS REST API")
    Rel(mycastlePlatform, ollama, "Wywołuje", "HTTP REST API")
    Rel(minisPlatform, github, "Odczytuje pliki", "HTTPS GitHub API")
    Rel(minisPlatform, arduinoCli, "Kompiluje firmware", "child_process / docker exec")
```

## Aktorzy

| Aktor | Rola |
|-------|------|
| **Użytkownik** | Korzysta z obu platform przez przeglądarkę. W Minis ma swoje urządzenia, projekty IoT, dashboard telemetrii |
| **Administrator** | Zarządza definicjami urządzeń, modułów, projektów. Może impersonować innych użytkowników |
| **Urządzenie IoT** | Mikrokontroler (ESP32, Arduino) z firmware publikujący dane MQTT. Reaguje na komendy |

## Systemy zewnętrzne

| System | Użycie |
|--------|--------|
| **OpenAI API** | AI assistant (tool calling), skanowanie paragonów (Vision API) |
| **Anthropic API** | AI assistant (Claude models) |
| **Ollama** | Lokalne LLM dla prywatności danych |
| **GitHub** | VFS provider — pliki z repozytoriów GitHub w Monaco Editor |
| **Arduino CLI** | Kompilacja `.ino` sketchy, upload przez port COM/Serial |
