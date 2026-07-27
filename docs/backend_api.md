Backend to funkcjonalność serrweera backend dostepne przez pliki api z poziomu skryptow uruchaminych :
- w app/mycastle-web na stronie Drive w katalogu server - napisac w pliku packages/core-backend/src/api.ts
- w przegladarce sandobox skryptow ts w Drive za pomoca importu pliku - packages/core/browser/server/api.ts

Realizuje api
kod uruchamiany na backend znajduje sie packages/core-backend/src/server/api.ts

Opisane ponizej api jest bardzo obgole uzopelnij co gdzie trzeba.
Opisane api jest ponizej i trzeba zerealizowac w backend:
- jako endpointy serwera Http w pliku packages/core-backend/src/server/http.ts
- jako commendy wysylane na topic /server/cmd a odpowiedzi na funkcje w topic /client/MqttClientId tego z class Conn
 w pliku packages/core-backend/src/server/mqtt.ts


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


// - sciezka relatywna do pliku w katalogu data beckend
typedef server_filename : string 

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

iot_get_devices(conn) : IotDevice[]

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