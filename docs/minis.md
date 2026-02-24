

Minis jest platformą wspierającą tworzenie projektów  DYI, na początku skierowaną dla dzieci. Dziecko z bazy dostępnych projektów wybiera sobie ten nad którym chciałby pracować . Następnie dziecko ma możliwość pracy nad następującymi procesami: składanie urządzenia, edytowanie gotowego projektu programu i wgrywanie go.

*Filesystem w data/minis:*

- Admin/
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
    - Users.json
- Users/
    - Mateo/
        - Projects/
            - Arduino1
        - Device.json
        - Module.json

FileSystem struktura katalogu projektu:
ToDo

*Definiuje następujące modele w pakiecie core*

MinisDeviceDef
- name
- modules - list of MinisModuleDefId

MinisDevice:
- MinisDeviceDefId
- isAssembled
- sn - serial number

MinisModuleDef:
- name - np Esp32devkitC
- soc - np. Esp32 IF not „” the isProgrammagle = true
- isProgrammable

MinisModule:
- MinisModuleDefId
- sn

MinisProjectDef
- name
- version
- DeviceDefId
- ModuleDefId
- software_platform
    - Arduino
- blocklydef
- Pliki .blockly/.ino

MinisProject
- name
- ProjectDefId
- Kopia plików .blockly/.ino

*Na podstawie modeli definiuje Nody w pakiecie core*
Definiuje nody, które oprócz atrubutów, definuja popularne funkcje, i stany

*Endpointy minis-backend*

Ma następujące endpointy operacji CRUD funkcjonalności:
 - admin
 - user

cały backend ma wdrożonego swaggers,

*Strony*

Aplikacja ma mieć interfejs w języku angielskim.

Chciałby aby strony w wiekszości ptrzykadków kożystały z endpointów minis-backend.

Na stronie głównej / pojawia się lista z użytkownika na którego można się zalogować.
Po wybraniu przejscie na strone /login gdzie następuje podanie hasła dla użytkownika. 
Po poprawnym podaniu hasła otworzenie strony /user/{userid}/main.

Na wszystkich stronach admina /admin/{userid}/* pojawiło się menu po lewej z przyciskami do podstron:
- Main /admin/{useriid}/main
- Users - /admin/{userid}/users
- DevicesDef - /admin/{userid}/devicesdefs
- ModulesDef - /admin/{userid}/modulesdefs
- ProjectDef - /projects/{user}/projectdefs

Na stronie Users /admin/{userid}/users:
- wyświetlana jest lista użytkowników, z ikonami akcji usuń, edytuj
- Jest przycisk Add User, wywołujący modal dodania użytkownika

Na stronie DevicesDef /admin/{userid}/devicesdefs:
- wyświetlana jest lista definicji użądzeń, z ikonami akcji usuń, edytuj
- Jest przycisk Add DeviceDef, wywołujący modal dodania użytkownika

Na stronie ModulesDef /admin/{userid}/modulesdefs:
- wyświetlana jest lista modułów

Na stronie ProjectDefs /admin/{userid}/projectdefs:
wyświetlana jest lista z definicjami projektów, z ikonami akcji usuń, edytuj
Jest przycisk Add ProjectDef, wywołujący modal dodania definicji projektu


Na wszystkich stronach użytkownika /user/{userid}/* pojawiło się menu po lewej  z przyciskami do podstron
 - Main /user/{useriid}/main
- Devices - /user/{userid}/devices
- Projects - /user/{user}/projects

Na stronie głównej użytkownika /user/{userid}/main} chcę żeby użytkownik wybrał czynność: 
- Dodanie gotowego  urządzenia
- składanie  urządzenia 
- Otwarcie projektu  urządzenia 

Na stronie Devices /user/{userid/devices}:
- wyświetlana jest lista złożonych urządzeń 
- Jest przycisk Add Assembled Device
- Jest przecisk Assemble Device

Na stronie Projects /user/{userid}/projects:
- wyświetlana jest lista zapisanych projektów 
- Jest przycisk Add
    - Wyświetlany jest modal

Dla wszytskich stron na górze stron pojawia się pasek tytułowy uniwersalny na który strony moga dodawac elementy ui  który tez ma przycisk zarządzajacgo kontem po prawej a w nim menu item logout, dla amina menu item  zmiany widoku user/admin

