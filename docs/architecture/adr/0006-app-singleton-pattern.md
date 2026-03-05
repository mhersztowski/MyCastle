# 0006. App Singleton Pattern

Data: 2024-02-01
Status: Accepted

## Kontekst

Aplikacje frontendowe (mycastle-web, minis-web) mają wiele serwisów (mqttClient, filesystemService, aiService, speechService, etc.) które muszą być:
1. Inicjalizowane przed renderem React
2. Dostępne z dowolnego komponentu bez prop drilling
3. Skonfigurowane z wzajemnymi zależnościami (np. conversationService potrzebuje aiService + filesystemService)

## Rozważane opcje

- **App Singleton** — `App.create()` w `main.tsx`, `App.instance.serviceName` w komponentach
- **React Context dla każdego serwisu** — Context API, wymaga wrapowania każdego serwisu
- **Zustand / Redux** — store z serwisami, overkill, miesza state management z dependency injection
- **Module-level singletons** — `export const aiService = new AiService()` per moduł — brak kontroli kolejności init
- **Dependency injection container** — Inversify/tsyringe — overhead konfiguracji

## Decyzja

Wybrana opcja: **App Singleton Pattern**, ponieważ:

- `App.create(config)` uruchamiane w `main.tsx` PRZED `ReactDOM.render()` — serwisy gotowe przed pierwszym renderem
- `App.instance` dostępne wszędzie — `const { aiService } = App.instance`
- Wyraźna kolejność inicjalizacji serwisów i ich zależności
- React Contexty (useMqtt, useFilesystem, useNotification) pozostają dla **reaktywnego stanu UI** — App Singleton dla serwisów
- Pattern znany z Angular/NestJS — DI przez kontener

## Konsekwencje

### Pozytywne
- Serwisy inicjalizowane raz, dostępne wszędzie bez HOC/Context wrapping
- Jawna kolejność inicjalizacji i shutdown (graceful)
- Testowanie: mockowanie przez `App.create({ aiService: mockAiService })`
- `App.instance.shutdown()` — czysty cleanup przy HMR (dev)

### Negatywne / kompromisy
- Komponenty importują `App` bezpośrednio — tight coupling z globalnym singletonym
- React DevTools nie widzi serwisów (nie są w state) — debugowanie przez console/breakpoints
- SSR niemożliwy bez refaktoru (singleton = globalny stan per process)
