# Arduino Compilation & Upload Flow

Przepływ kompilacji i uploadu firmware Arduino/ESP32 przez Minis Platform.

## Kompilacja Sketcha

```mermaid
sequenceDiagram
    participant User as Użytkownik<br/>(minis-web)
    participant BlocklyComp as ArduBlockly/<br/>UPythonBlockly Component
    participant MonacoEditor as Monaco Editor
    participant SketchAPI as Sketch API<br/>(MinisHttpServer)
    participant CompileAPI as Compile API<br/>(MinisHttpServer)
    participant ArduSvc as ArduinoService
    participant ArduLocal as ArduinoCliLocal /<br/>ArduinoCliDocker
    participant FileSystem as data/Minis/Users/<br/>:userName/:projectName/

    Note over User,FileSystem: 1. Edycja kodu w edytorze

    User->>BlocklyComp: układa bloki wizualnie
    BlocklyComp->>BlocklyComp: ArduinoGenerator.generate() → C++ code
    BlocklyComp->>MonacoEditor: setContent(generatedCode)
    User->>MonacoEditor: może edytować bezpośrednio

    User->>MonacoEditor: Ctrl+S / Save
    MonacoEditor->>SketchAPI: PUT /api/users/{user}/projects/{proj}/sketches/{sketch}/main.ino
    SketchAPI->>FileSystem: writeFile(sketchPath, code)

    Note over User,FileSystem: 2. Kompilacja

    User->>CompileAPI: POST /api/users/{user}/projects/{proj}/compile<br/>{"sketchName": "main", "fqbn": "esp32:esp32:esp32"}

    CompileAPI->>ArduSvc: compile(projectName, sketchName, fqbn)
    ArduSvc->>ArduSvc: isAvailable? (check CLI)

    alt Arduino CLI Local (ARDUINO_CLI_LOCAL_PATH set)
        ArduSvc->>ArduLocal: execFile(arduino-cli, ["compile", ...])
    else Docker (ARDUINO_CLI_DOCKER_NAME set)
        ArduSvc->>ArduLocal: docker exec {container} arduino-cli compile ...
    end

    ArduLocal->>ArduLocal: arduino-cli compile<br/>--fqbn esp32:esp32:esp32<br/>--output-dir {outputDir}<br/>{sketchDir}

    alt Compile success
        ArduLocal-->>ArduSvc: {success: true, output: "...", binaryPath}
        ArduSvc-->>CompileAPI: {success: true, files: ["main.ino.bin", "main.ino.elf"]}
        CompileAPI-->>User: 200 {success: true, files: [...]}

        Note over User: BuildOutputPanel shows success
    else Compile error
        ArduLocal-->>ArduSvc: {success: false, error: "...error message..."}
        CompileAPI-->>User: 200 {success: false, error: "..."}
        Note over User: BuildOutputPanel shows error log
    end
```

## Upload przez Serial (Web Serial API)

```mermaid
sequenceDiagram
    participant User as Użytkownik
    participant FlashDialog as FlashDialog<br/>(minis-web)
    participant API as GET /output<br/>(MinisHttpServer)
    participant EspFlash as EspFlashService<br/>(esptool-js)
    participant Serial as Web Serial API<br/>(Chrome/Edge)
    participant Device as ESP32 Device

    User->>FlashDialog: Upload firmware (po kompilacji)

    FlashDialog->>API: GET /api/users/{user}/projects/{proj}/output/main.ino.bin
    API-->>FlashDialog: binary data (ArrayBuffer)

    FlashDialog->>Serial: navigator.serial.requestPort()
    Serial-->>User: port selection dialog
    User-->>Serial: wybiera COM port

    FlashDialog->>EspFlash: flash(port, firmwareBinary)
    EspFlash->>Device: esptool-js: enter bootloader mode (DTR/RTS)
    EspFlash->>Device: erase flash
    EspFlash->>Device: write firmware chunks

    loop Postęp uploadu
        EspFlash-->>FlashDialog: onProgress(percent)
        FlashDialog-->>User: progress bar update
    end

    EspFlash->>Device: reset (exit bootloader)
    Device-->>EspFlash: running new firmware

    EspFlash-->>FlashDialog: {success: true}
    FlashDialog-->>User: "Upload complete!"

    Note over User,Device: Device łączy się z MQTT brokerem
    Device->>User: telemetria widoczna w IoT Dashboard
```

## Upload uPython przez WebREPL

```mermaid
sequenceDiagram
    participant User as Użytkownik
    participant UploadDialog as UploadDialog<br/>(minis-web)
    participant UPythonSvc as UPythonBlocklyService
    participant WebRepl as MpyWebReplService
    participant Device as MicroPython Device<br/>(WebREPL enabled)

    User->>UploadDialog: "Run only" or "Save as main.py"

    UploadDialog->>UPythonSvc: generateCode()
    UPythonSvc-->>UploadDialog: micropython code string

    UploadDialog->>WebRepl: connect(ws://device_ip:8266, password)
    WebRepl->>Device: WebSocket handshake + auth

    alt "Run only"
        WebRepl->>Device: execCode(code) via raw REPL
        Device-->>UploadDialog: output stream
        UploadDialog-->>User: output w terminal
    else "Save as main.py"
        WebRepl->>Device: putFile("main.py", code)
        Device-->>WebRepl: ack
        WebRepl-->>User: "main.py saved. Reboot to run."
    end
```

## Środowiska Arduino CLI

| Env Variable | Tryb | Opis |
|---|---|---|
| `ARDUINO_CLI_LOCAL_PATH` | Local | Ścieżka do `arduino-cli` binarki na hoście |
| `ARDUINO_CLI_DOCKER_NAME` | Docker | Nazwa kontenera Docker z arduino-cli |
| (brak) | Unavailable | `ArduinoService.isAvailable = false` |

## Wspierane platformy

| FQBN | Board | Blockly Profile |
|------|-------|-----------------|
| `esp8266:esp8266:huzzah` | Adafruit Feather Huzzah | ESP8266 Huzzah |
| `esp8266:esp8266:d1_mini` | Wemos D1 Mini | Wemos D1 |
| `esp32:esp32:esp32` | ESP32 DevKitC | ESP32 |
| `arduino:avr:uno` | Arduino Uno | Arduino Uno |
| `arduino:avr:nano` | Arduino Nano | Arduino Nano |
| `arduino:avr:mega` | Arduino Mega | Arduino Mega |
| `arduino:avr:leonardo` | Arduino Leonardo | Arduino Leonardo |

## Ścieżki projektów (FileSystem)

```
data/Minis/Users/{userName}/{projectName}/
├── sketches/
│   └── {sketchName}/
│       ├── main.ino       # Arduino sketch
│       └── ...
├── output/                # Skompilowane binaria
│   ├── main.ino.bin       # Firmware binary
│   ├── main.ino.elf       # Debug ELF
│   └── ...
├── libraries/             # Lokalne biblioteki projektu
└── custom-config.yaml     # Custom arduino-cli config
```
