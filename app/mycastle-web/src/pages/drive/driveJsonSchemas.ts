/**
 * Inline JSON Schema definitions used by the Drive editor.
 *
 * These mirror the on-disk schema files in
 * `drive/mdscript/json/schema/` — duplicated intentionally so Monaco can
 * apply them without going through HTTP / VFS (the JSON worker only fetches
 * `$schema` URIs over http(s) when `enableSchemaRequest: true`; relative
 * VFS paths aren't reachable).
 *
 * When you change one of these, mirror the change into the on-disk file so
 * the canonical version a user can read/copy stays accurate. The opposite —
 * editing only the on-disk file — won't change Monaco's behaviour.
 */

// `$schema` is declared as an allowed property on every schema below — without
// it, `additionalProperties: false` causes Monaco's JSON validator to flag the
// `"$schema": "inmemory://…"` line in the example files as "property $schema
// is not allowed". The schemas live in the same files they describe, so the
// pointer to themselves is legitimate.
const SCHEMA_META_PROPS = {
  $schema: { type: 'string', description: 'URI of the JSON Schema this file conforms to.' },
} as const;

export const PERSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Person',
  description: 'Osoba w systemie - imię, kontakt, hobby, dane meta.',
  type: 'object',
  required: ['firstName', 'lastName', 'email'],
  additionalProperties: false,
  properties: {
    ...SCHEMA_META_PROPS,
    firstName: { type: 'string', description: 'Imię', minLength: 1, maxLength: 80 },
    lastName:  { type: 'string', description: 'Nazwisko', minLength: 1, maxLength: 80 },
    age:       { type: 'integer', description: 'Wiek w pełnych latach', minimum: 0, maximum: 150 },
    email:     { type: 'string', description: 'Adres e-mail', format: 'email' },
    phone:     { type: 'string', description: 'Numer telefonu w formacie międzynarodowym', pattern: '^\\+?[0-9 ()-]{6,20}$' },
    role:      { type: 'string', description: 'Rola w systemie', enum: ['admin', 'editor', 'viewer', 'guest'] },
    hobbies: {
      type: 'array',
      description: 'Lista hobby (unikalne)',
      items: { type: 'string', minLength: 1 },
      uniqueItems: true,
      maxItems: 20,
    },
    address: {
      type: 'object',
      description: 'Adres pocztowy',
      required: ['city', 'country'],
      properties: {
        street:  { type: 'string', description: 'Ulica + numer' },
        city:    { type: 'string', description: 'Miasto' },
        zip:     { type: 'string', description: 'Kod pocztowy', pattern: '^[0-9A-Z- ]{3,12}$' },
        country: { type: 'string', description: 'Kod kraju ISO 3166-1 alpha-2', minLength: 2, maxLength: 2 },
      },
    },
    createdAt: { type: 'string', description: 'Data utworzenia rekordu (ISO 8601)', format: 'date-time' },
  },
} as const;

export const TASK_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Task',
  description: 'Pojedyncze zadanie w trackerze - status, priorytet, czas, etykiety.',
  type: 'object',
  required: ['id', 'title', 'status'],
  additionalProperties: false,
  properties: {
    ...SCHEMA_META_PROPS,
    id:          { type: 'string', description: 'UUID v4 zadania', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' },
    title:       { type: 'string', description: 'Krótki tytuł (do 200 znaków)', minLength: 1, maxLength: 200 },
    description: { type: 'string', description: 'Dłuższy opis - markdown dozwolony' },
    status:      { type: 'string', description: 'Aktualny status', enum: ['todo', 'in-progress', 'blocked', 'done', 'cancelled'] },
    priority:    { type: 'string', description: "Priorytet - 'low' to można zostawić, 'critical' to robić teraz", enum: ['low', 'normal', 'high', 'critical'], default: 'normal' },
    labels: {
      type: 'array',
      description: 'Etykiety tematyczne (frontend, bug, refactor, ...)',
      items: { type: 'string', minLength: 1, maxLength: 30 },
      uniqueItems: true,
    },
    dueDate:       { type: 'string', description: 'Termin (ISO 8601 date lub datetime)', format: 'date-time' },
    estimateHours: { type: 'number', description: 'Szacowany czas w godzinach (może być ułamkowy)', minimum: 0, exclusiveMaximum: 1000 },
    assignee:      { type: 'string', description: 'Nick przypisanej osoby' },
    subtasks: {
      type: 'array',
      description: 'Lista pod-zadań',
      items: {
        type: 'object',
        required: ['title', 'done'],
        properties: {
          title: { type: 'string' },
          done:  { type: 'boolean' },
        },
      },
    },
  },
} as const;

export const APP_CONFIG_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'AppConfig',
  description: 'Konfiguracja przykładowej aplikacji - server, baza, feature flagi.',
  type: 'object',
  required: ['server', 'database'],
  additionalProperties: false,
  properties: {
    ...SCHEMA_META_PROPS,
    server: {
      type: 'object',
      description: 'Ustawienia HTTP servera',
      required: ['host', 'port'],
      properties: {
        host: { type: 'string', description: 'Adres na którym nasłuchuje serwer', default: '0.0.0.0' },
        port: { type: 'integer', description: 'Port TCP', minimum: 1, maximum: 65535 },
        tls:  { type: 'boolean', description: 'Czy włączyć HTTPS (wymaga certyfikatów poniżej)', default: false },
        cert: { type: 'string', description: 'Ścieżka do pliku certyfikatu PEM' },
        key:  { type: 'string', description: 'Ścieżka do klucza prywatnego' },
      },
    },
    database: {
      type: 'object',
      description: 'Połączenie z bazą',
      required: ['kind', 'url'],
      properties: {
        kind:     { type: 'string', description: 'Rodzaj silnika', enum: ['sqlite', 'postgres', 'mysql'] },
        url:      { type: 'string', description: 'Connection string (np. postgres://user:pwd@host/db)', minLength: 1 },
        poolSize: { type: 'integer', description: 'Liczba połączeń w puli', minimum: 1, maximum: 100, default: 10 },
      },
    },
    logging: {
      type: 'object',
      description: 'Konfiguracja logów',
      properties: {
        level: { type: 'string', description: 'Minimalny poziom logowania', enum: ['debug', 'info', 'warn', 'error'], default: 'info' },
        json:  { type: 'boolean', description: 'Logi w formacie JSON (do agregatorów typu Loki)', default: false },
      },
    },
    features: {
      type: 'object',
      description: 'Feature flagi - boolean per nazwa',
      additionalProperties: { type: 'boolean' },
    },
  },
} as const;

export const PRODUCT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Product',
  description: 'Produkt w katalogu sklepu - cena, stan, tagi, warianty.',
  type: 'object',
  required: ['sku', 'name', 'price'],
  additionalProperties: false,
  properties: {
    ...SCHEMA_META_PROPS,
    sku:         { type: 'string', description: 'SKU - unikalny identyfikator produktu (litery, cyfry, myślniki)', pattern: '^[A-Z0-9-]{3,32}$' },
    name:        { type: 'string', description: 'Nazwa wyświetlana', minLength: 1, maxLength: 200 },
    description: { type: 'string', description: 'Opis produktu - markdown OK' },
    price: {
      type: 'object',
      description: 'Cena z walutą',
      required: ['amount', 'currency'],
      properties: {
        amount:   { type: 'number', description: 'Kwota (nieujemna)', minimum: 0 },
        currency: { type: 'string', description: 'Waluta ISO 4217 (3 znaki)', minLength: 3, maxLength: 3, default: 'PLN' },
      },
    },
    inStock: { type: 'boolean', description: 'Czy aktualnie dostępny', default: true },
    stock:   { type: 'integer', description: 'Ilość sztuk w magazynie', minimum: 0 },
    tags: {
      type: 'array',
      description: 'Tagi tematyczne / filtry',
      items: { type: 'string', minLength: 1, maxLength: 30 },
      uniqueItems: true,
      maxItems: 50,
    },
    images: {
      type: 'array',
      description: 'URL-e do zdjęć (max 10)',
      items: { type: 'string', format: 'uri' },
      maxItems: 10,
    },
    variants: {
      type: 'array',
      description: 'Warianty produktu (kolor, rozmiar)',
      items: {
        type: 'object',
        required: ['name', 'sku'],
        properties: {
          name:  { type: 'string', description: "Nazwa wariantu (np. 'XL czerwony')" },
          sku:   { type: 'string', pattern: '^[A-Z0-9-]{3,40}$' },
          stock: { type: 'integer', minimum: 0 },
        },
      },
    },
  },
} as const;
