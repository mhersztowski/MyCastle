Backend to funkcjonalność serrweera backend dostepne przez pliki api z poziomu skryptow uruchaminych :
- w app/mycastle-web na stronie Drive w katalogu server - napisac w pliku packages/core-backend/src/api.ts
- w przegladarce sandobox skryptow ts w Drive za pomoca importu pliku - packages/core/browser/server/api.ts

Realizuje api
kod uruchamiany na backend znajduje sie packages/core-backend/src/server/api.ts

Opisane ponizej api jest bardzo obgole uzopelnij co gdzie trzeba.
Opisane api jest ponizej i trzeba zerealizowac w backend:
- jako endpointy serwera Http w pliku packages/core-backend/src/server/http.ts
- jako commendy wysylane na topic SERVER_TOPIC="/server/cmd" a odpowiedzi na funkcje w topic /client/MqttClientId tego z class Conn
 w pliku packages/core-backend/src/server/mqtt.ts

funkcje z prefixem web_ - sa dodawane tylko w packages/core/browser/server/api.ts

Klasy narzedziowe wykozystywane przez mqtt, http np github - funkconalnosc api backend - umieszczone sa w pliku packages/core-backend/src/server/logic.ts


```
Class Conn
   Type: Http, Mqtt
   HttpUrl
   HttpUsername
   HttpPassword
   MqttUrl np ws://adress:port/path wss://
   MqttUsername
   MqttPassward
   MqttClientId

Class auth
   Username
   Password

Class person 
    Id

Class agent_ai_model
    Id
    Company
    ModelName

Class ai_chat
    Id 
    Model

Class Mail
    from : string
    to : string[]
    topic : string
    content : string

Class ServerConfig
    username
    token 
    url //server http url
    mqtt_url

// - sciezka relatywna do pliku w katalogu data beckend
typedef server_filename : string 

server_get_config() : ServerConfig

// server_get_config — szczegóły (implementacja: core-backend/src/api.ts)
//   Zwraca { username, token, url, mqtt_url } wstrzyknięte skryptowi przez runner Drive:
//   backend zna właściciela (skrypt leży w `Minis/Users/{user}/drive/…`) i własny adres,
//   więc skrypt nie trzyma loginu ani URL-a w kodzie:
//
//       const cfg = server_get_config();
//       const conn = await conn_mqtt_connect(cfg.mqtt_url, cfg.username, cfg.token);
//
//   `token` to podpisany JWT właściciela — backend nie zna hasła (trzyma jego hash).
//   `conn_mqtt_connect` przyjmuje go jako hasło MQTT, a `conn_http_connect` rozpoznaje
//   token (JWT lub klucz `minis_…`) i pomija logowanie.
//   Zmienne środowiskowe: MYCASTLE_SERVER_URL, MYCASTLE_MQTT_URL, MYCASTLE_USER,
//   MYCASTLE_TOKEN (adres publiczny nadpisuje MYCASTLE_PUBLIC_URL po stronie backendu).
//   Uruchomiony poza runnerem zwraca `http://localhost:{PORT|1894}` i puste poświadczenia.

conn_http_connect(...) : Conn
conn_http_disconnect(conn)

conn_mqtt_connect(...) : Conn
conn_mqtt_disconnect(conn)

conn_mqtt_topic_cmd() : string
conn_mqtt_topic_cmd_res() : string


conn_on_error(callback)
conn_on_res(callbact)
conn_path_user(conn) : string



file_read_string(conn, server_filename) : string
file_write_string(conn, server_filename, data)

git_clone(conn, url, server_filename)
git_add_all(conn, paserver_filenameth)
git_commit(conn, server_filename, comment)
git_push(conn, server_filename)
git_pull(conn, server_filename)
git_commit_current()
git_history(conn, server_filename)
git_diff(conn, server_filename, commit_from, commit_to)


http_request(conn, url, options?) : HttpResponse // z mozliwoscia ustawinia naglowkow itd

// http_request — szczegóły (implementacja: core-backend/src/server/logic.ts `httpRequest`)
//   options: { method?, headers?, body?, query?, timeoutMs? (30 s), responseType?: 'text'|'json'|'base64' }
//   HttpResponse: { status, ok, headers, body, encoding }
//
//       const res = await http_request(conn, 'https://api.github.com/repos/x/y', {
//         headers: { 'User-Agent': 'MyCastle' },
//       });
//       if (res.ok) console.log(res.body);
//
// • Żądanie wychodzi Z SERWERA — skrypt w przeglądarce nie podlega wtedy CORS, a adresatem
//   mogą być usługi w sieci backendu. W skrypcie Node to też wygodne: jednolity kształt
//   odpowiedzi i wspólny timeout.
// • Status 4xx/5xx wraca normalnie w `status`; wyjątek zostaje na brak odpowiedzi
//   (timeout, błąd sieci, adres spoza http/https).
// • Ciało żądania: obiekt → JSON (+ nagłówek Content-Type), string → bez zmian.
//   Nagłówki muszą być Latin-1 (tak działa HTTP) — polskie znaki dają czytelny błąd.
// • Ciało odpowiedzi: JSON gdy content-type jest JSON-owy, tekst dla typów tekstowych,
//   base64 dla binariów; `encoding` mówi, co dostałeś, a `responseType` to wymusza.

http_add_endpoint(conn, path, callback, opts?)   // rejestruje endpoint HTTP obsługiwany przez skrypt
                                                 // opts: { public?: boolean }
http_remove_endpoint(conn, path)
http_list_endpoints(conn) : string[]

// Endpointy skryptów — szczegóły (implementacja: core-backend/src/server/logic.ts,
// transporty: server/mqtt.ts + server/http.ts, trasa: MycastleHttpServer `/api/server/ep/…`)
//
//   await http_add_endpoint(conn, 'webhook/github', async (req) => {
//     // req = { requestId, path, method, query, headers, body }
//     return { status: 202, headers: { 'x-src': 'skrypt' }, body: { ok: true } };
//   });
//
// • Wymaga połączenia MQTT — serwer wywołuje callback pushem na `/client/{MqttClientId}`
//   (koperta `{ event: 'http_endpoint_request', request }`), a skrypt odsyła wynik komendą
//   `http_endpoint_response { requestId, status?, headers?, body?, error? }`. Po HTTP nie ma
//   kanału zwrotnego, więc rejestracja kończy się błędem.
// • Wywołanie: `ANY /api/server/ep/{path}` z JWT właściciela. Widoczne są wyłącznie endpointy
//   zalogowanego użytkownika — cudze są nieodróżnialne od nieistniejących (404).
// • `{ public: true }` znosi wymóg JWT — endpoint wywoła każdy, kto zna adres, BEZ żadnych
//   nagłówków (webhooki GitHuba i podobnych usług). Ochroną jest wyłącznie nieodgadywalność
//   ścieżki plus limit tempa (`publicRateLimitPerMinute`, domyślnie 120/min → nadmiar to 429).
//   Publiczne ścieżki są globalnie unikalne: obcy użytkownik nie przejmie zajętego adresu,
//   właściciel może się przerejestrować (restart skryptu). Endpointy prywatne pozostają
//   niewidoczne dla ruchu nieuwierzytelnionego (404).
// • Zwrotka callbacku: obiekt z polami `status`/`headers`/`body` opisuje odpowiedź; każda inna
//   wartość (string, tablica, zwykły obiekt) staje się ciałem ze statusem 200. String wychodzi
//   jako `text/plain`, reszta jako JSON — o ile callback nie ustawi własnego `content-type`.
// • Statusy błędów: 404 (brak endpointu), 500 (callback rzucił), 504 (skrypt nie odpowiedział
//   w `httpEndpointTimeoutMs`, domyślnie 30 s), 503 (brak kanału MQTT po stronie serwera).
// • Rejestracja żyje tyle, co proces skryptu; ponowne `http_add_endpoint` tej samej ścieżki
//   nadpisuje klienta, więc po restarcie żądania nie trafiają do martwego połączenia.


iot_get_devices(conn) : IotDevice[]

// iot_log* wysyla komunikat na kanal SERVER_TOPIC o type "log"
iot_log_info(conn, msg)
iot_log_warnning(conn, msg)      // alias bez literówki: iot_log_warning
iot_log_error(conn, msg)

// Log — szczegóły (implementacja: core-backend/src/server/logic.ts `iotLog`,
// fasady: core-backend/src/api.ts oraz core/browser/server/api.ts)
//
//   Pakiet: { type: 'log', level: 'info'|'warning'|'error', message, userName,
//             clientId?, source?, ts }
//
// • Publikacja jest JEDNOSTRONNA — nadawca nie czeka na odbiorców. Pakiet nie ma
//   pól `id`/`op`, więc serwer nasłuchujący tego samego topiku go nie wykonuje
//   (brak pętli zwrotnej); konsumentami są server-logic, automatyzacje, podglądy.
// • Nad MQTT skrypt publikuje wprost (bez round-tripu przez serwer, `clientId`
//   wypełniony); przez HTTP idzie komenda `iot_log { level, message }`, a pakiet
//   na szynę wystawia serwer — wtedy `clientId` jest pusty.
// • Poziom jest normalizowany (`warn` → `warning`); inne wartości i puste
//   `message` kończą się błędem. Bez podłączonego brokera `iot_log` zgłasza błąd.

iot_device_command(conn, device, command, ...)
iot_device_telemetry(conn, device, key) : { value, unit}

iot_device_ext_command(conn, device, ext, command, ...) : result

iot_device_ext_vfs_stat(conn, device, ...) : result
iot_device_ext_vfs_readdir(conn, device, ...) : result
iot_device_ext_vfs_readfile(conn, device, ...) : result
iot_device_ext_vfs_writefile(conn, device, ...) : result
iot_device_ext_vfs_delete(conn, device, ...) : result
iot_device_ext_vfs_rename(conn, device, ...) : result
iot_device_ext_vfs_mkdir(conn, device, ...) : result

// IoT — szczegóły sygnatur (implementacja: core-backend/src/server/logic.ts)
//   iot_get_devices(conn) → IotDevice[]  { deviceId, userId, status, lastSeenAt, extensions[] }
//   iot_device_command(conn, device, command, params?)         → rekord komendy (id, status)
//   iot_device_telemetry(conn, device, key)                    → { value, unit } albo null
//   iot_device_ext_command(conn, device, ext, command, params?) → wynik rozszerzenia
//   iot_device_ext_vfs_stat/readdir/mkdir(conn, device, path)
//   iot_device_ext_vfs_readfile(conn, device, path)            → { data: base64 }
//   iot_device_ext_vfs_writefile(conn, device, path, base64, options?)
//   iot_device_ext_vfs_delete(conn, device, path, options?)
//   iot_device_ext_vfs_rename(conn, device, path, newPath, options?)
// Wszystkie operacje działają wyłącznie na urządzeniach właściciela (userId z JWT).
// Dziś generyczny kanał ext obsługuje rozszerzenie `vfs`; pozostałe (vkbd/vmouse/
// display) mają własne, wąskie API i zgłaszają błąd przy wywołaniu przez iot_device_ext_command.

// zip - wszsytko z server_filename
zip_pack(input, ouiput)
zip_unpack(input, output)
zip_upadate(path, files[])
zip_delete(path, files[])

mail_send(conn, Mail)
mail_inbox() : Mail[]
mail_outbox() : Mail[]

project_arduino_build()
project_arduino_get_output() : string // server_filename

project_picosdk_build()
project_picosdk_get_output() : string // server_filename


```