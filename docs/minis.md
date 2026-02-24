Minis jest platformą wspierającą tworzenie projektów  DYI, na początku skierowaną dla dzieci

*Filesystem w data/minis:*

- admin/
    - HowTo/
        - ConnectEsp32.md
    - DeviceDefs/
        - Esp32devkitc/
            - DeviceDef.json
            - Description.json
    - ModuleDefs/
        - Esp32devkitc/
            - ModuleDef.json
    - ProjectsDefs /
        - ArduinoTutorial - katalog projekty
    - DeviceDefList.json
    - ModuleDefList.json
    - ProjectDefList.json
- Users/
    - Mateo/
        - Projects/
            - ArduinoTutorial
        - Device.json
        - Module.json

FileSystem struktura katalogu projektu:
ToDo

*Definiuje następujące modele*

DeviceDef - filesystem

- name
- modules - list of ModuleDefId

Device:

- DeviceDefName
- isAssembled
- sn - serial number

ModuleDef:

- name - np Esp32devkitC
- soc - np. Esp32 IF not „” the isProgrammagle = true
- isProgrammable

Module:

- ModuleDefName
- sn

ProjectDef

- name
- version
- ModuleDefName
- software_platform
    - Arduino
- blocklydef
- Pliki .blockly/.ino

Project

- name
- ProjectDefName
- Kopia plików .blockly/.ino

*Na podstawie modeli definiuje Nody*
Definiuje nody, które oprócz atrubutów, definuja popularne funkcje, i stany