# Authentication Flow

Przepływ autentykacji w Minis Platform — JWT dla użytkowników, API Keys dla automatyzacji.

## Login Flow (JWT)

```mermaid
sequenceDiagram
    participant Browser as minis-web<br/>(przeglądarka)
    participant AuthCtx as AuthContext
    participant API as MinisHttpServer
    participant JwtSvc as JwtService
    participant PwdSvc as PasswordService
    participant FileSystem as FileSystem<br/>(JSON files)

    Browser->>AuthCtx: login(name, password)
    AuthCtx->>API: POST /api/auth/login<br/>{"name": "user1", "password": "..."}

    API->>FileSystem: readJson("Admin/users.json")
    FileSystem-->>API: users[]

    API->>API: find user by name

    alt User not found
        API-->>Browser: 401 Unauthorized
    end

    alt Password is plaintext (migration)
        API->>PwdSvc: hashPassword(plaintext)
        API->>FileSystem: writeJson (migrated bcrypt hash)
    end

    API->>PwdSvc: verify(password, bcryptHash)

    alt Password invalid
        API-->>Browser: 401 Unauthorized
    end

    API->>JwtSvc: sign({userId, name, isAdmin}, "24h")
    JwtSvc-->>API: JWT token

    API-->>Browser: 200 {"token": "eyJ...", "user": {...}}

    AuthCtx->>AuthCtx: sessionStorage.setItem("session", {user, token})
    AuthCtx->>AuthCtx: setAuthToken(token) → minisApi + rpcClient
    AuthCtx-->>Browser: currentUser state updated → redirect
```

## Request Authentication (checkAuth middleware)

```mermaid
sequenceDiagram
    participant Client as Client<br/>(browser / script / IoT)
    participant Server as MinisHttpServer
    participant CheckAuth as checkAuth()
    participant JwtSvc as JwtService
    participant ApiKeySvc as ApiKeyService

    Client->>Server: GET/POST /api/users/:userName/...<br/>Authorization: Bearer <token>

    Server->>CheckAuth: checkAuth(request)
    CheckAuth->>CheckAuth: extract token from Authorization header

    alt Token starts with "minis_" (API Key format)
        CheckAuth->>ApiKeySvc: verifyKey(token)
        ApiKeySvc->>ApiKeySvc: SHA-256 hash(token)
        ApiKeySvc->>ApiKeySvc: lookup in users' api_keys.json
        alt Key found
            ApiKeySvc-->>CheckAuth: {userId, name, isAdmin: false}
        else Key not found
            ApiKeySvc-->>CheckAuth: null
        end
    else JWT token
        CheckAuth->>JwtSvc: verify(token)
        alt Token valid
            JwtSvc-->>CheckAuth: {userId, name, isAdmin}
        else Token expired/invalid
            JwtSvc-->>CheckAuth: null (throws)
            CheckAuth->>CheckAuth: returns null
        end
    end

    alt checkAuth returns null
        Server-->>Client: 401 Unauthorized
    else isAdmin required but user is not admin
        Server-->>Client: 403 Forbidden
    else Authorized
        Server->>Server: handle request with user context
        Server-->>Client: 200 + response
    end
```

## MQTT Authentication

```mermaid
sequenceDiagram
    participant IoT as IoT Device / Frontend
    participant Broker as MqttServer<br/>(Aedes)
    participant AuthCb as setAuthenticate callback

    IoT->>Broker: MQTT CONNECT<br/>clientId: "esp32-device1"<br/>username: "user1"<br/>password: "minis_abc123..." OR "eyJ..."

    Broker->>AuthCb: authenticate(client, username, password)

    AuthCb->>AuthCb: try JWT.verify(password)
    alt JWT valid
        AuthCb-->>Broker: callback(null, true)
    else JWT invalid
        AuthCb->>AuthCb: try ApiKeyService.verifyKey(password)
        alt API Key valid
            AuthCb-->>Broker: callback(null, true)
        else Invalid
            AuthCb-->>Broker: callback(new Error("Unauthorized"), false)
        end
    end

    alt Auth failed
        Broker-->>IoT: MQTT CONNACK (returnCode: 5 - Not Authorized)
    else Auth success
        Broker-->>IoT: MQTT CONNACK (returnCode: 0 - Accepted)
    end
```

## API Key Management

```mermaid
sequenceDiagram
    participant Admin as Admin
    participant Web as minis-web
    participant API as MinisHttpServer
    participant ApiKeySvc as ApiKeyService
    participant FileSystem as data/api_keys.json

    Admin->>Web: Create API Key
    Web->>API: POST /api/users/{userName}/api-keys<br/>{"description": "Home automation script"}

    API->>ApiKeySvc: createKey(userName, description)
    ApiKeySvc->>ApiKeySvc: generate: "minis_" + randomBytes(32).hex
    ApiKeySvc->>ApiKeySvc: SHA-256 hash(rawKey)
    ApiKeySvc->>FileSystem: store {id, hash, prefix, description, createdAt}

    ApiKeySvc-->>API: {id, rawKey, description, createdAt}
    Note over ApiKeySvc: rawKey pokazany TYLKO RAZ

    API-->>Web: {id, key: "minis_abc...", description}
    Web-->>Admin: "Skopiuj klucz — nie zostanie pokazany ponownie"

    Note over Admin,FileSystem: Klucz używany jako MQTT password lub Bearer token
```

## Publiczne endpointy (bez auth)

| Endpoint | Opis |
|----------|------|
| `POST /api/auth/login` | Logowanie, zwraca JWT |
| `GET /api/auth/users` | Lista użytkowników (bez haseł) — dla login page |
| `GET /api/docs*` | Swagger UI |
| `GET /api/docs/swagger.json` | OpenAPI spec |
