# 0005. Zod jako single source of truth

Data: 2024-03-01
Status: Accepted

## Kontekst

System potrzebuje walidacji danych na wielu poziomach: MQTT payloads (IoT), REST API endpoints, RPC methods, Swagger/OpenAPI generowanie. Powielanie schematu w TypeScript interfaces + osobna walidacja + osobna dokumentacja prowadzi do desynchronizacji.

## Rozważane opcje

- **Zod** — TypeScript-first schema library, infer types + validate + JSON schema export
- **io-ts** — functional types, bardziej verbose, mniejsza popularność
- **class-validator + class-transformer** — decorator-based, wymaga klas zamiast plain objects
- **JSON Schema** — standard, ale brak TypeScript type inference
- **Ręczna walidacja** — if/typeof sprawdzenia, nie skaluje się

## Decyzja

Wybrana opcja: **Zod jako single source of truth** dla wszystkich schematu w systemie, ponieważ:

- **Type inference** — `z.infer<typeof Schema>` eliminuje duplikację interface/schema
- **Runtime validation** — `.parse()` i `.safeParse()` dla MQTT payloads, REST body, RPC input/output
- **JSON Schema export** — `zod-to-json-schema` generuje OpenAPI 3.0 spec automatycznie ze Swagger UI
- **Obszary zastosowania:**
  - `packages/core/mqtt/topics.ts` — `MqttTopicDef` z `payloadSchema: z.ZodType`
  - `packages/core/rpc/methods.ts` — `RpcMethodDef` z `inputSchema/outputSchema`
  - `app/minis-backend/swagger.ts` — `buildSwaggerSpec()` generuje spec z Zod schemas
  - `packages/core/mjd/` — Meta JSON Definition jako Zod-describable schema

## Konsekwencje

### Pozytywne
- Zmiana schematu w jednym miejscu → aktualizacja typów + walidacja + Swagger automatycznie
- MQTT Explorer w UI pokazuje type info z mqttTopics registry (Zod schemas)
- RPC Explorer generuje formularze z Zod schemas (autocomplete, field dependencies z `fieldMeta`)
- `x-autocomplete` i `x-depends-on` w Swagger z `fieldMeta` — smart forms bez dodatkowego kodu

### Negatywne / kompromisy
- Zod schemas muszą być w `@mhersztowski/core` (shared) — nie można definiować ich per-app
- Overhead importowania Zod na froncie (bundle size ~50KB gzipped) — akceptowalne
- `zod-to-json-schema` generuje draft-07, nie draft-2020 — minor incompatibilities
