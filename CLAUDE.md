# Project: MyCastle

## Overview
Web base application use to manage and agregate personal information data.

## Key Objectives / Current Focus
Projekt składa się z aplikacji backend i frontend

Aplikacja backend:
- napisana w node.js
- Składa się z następujących modułów
    - filesystem
        - wczytujący i zapisujący stan danych do plików
        - Dla szybszych operacji odczytu pliki przechowywane są w pamięci
        - Działający w katalogu o root dir w env rootDir
    - mqttserver
        - Server mqtt wysyłający/odbierajacy json
        - Definiujący klasę Client bo serwer może mieć wiele clientów
        - Zawierający klasę Packet która definiuje typy pakietów,
        - Zawierający klasy pakietów dla każdego z typów, serializuje/deserializuje pakiety, waliduje pakiety, wysyła oraz odbiera pakiety

Aplikacja frontend 
- aplikacja react w ts
- aplikacja mająca wygląd podobny do tej w aplikacjach google (min google cloud)
- wykożystująca Material UI i ikony material
- definiująca następujące moduły
    - mqttclient - połaczenie mqtt z aplikacja backend
    - filesystem - moduł odpowiedzialny za obsługę funkcjonalności filesystem
        - data/ - klasy danych runtime (DirData, FileData)
        - models/ - interfejsy modeli danych JSON (DirModel, FileModel, ProjectModel, TaskModel)
        - nodes - klasy wewnętrznego stanu modeli np TaskNode
          - zawirają pola jak w models ale z uzupełnieniem w wewnętrzny stan aplikacji
          - implementują często używaną funkcjonalność
        - components/ - klasy danych plików json te bardziej zagnieżdżone (FileComponent, DirComponent, FileJsonComponent)
        - FilesystemService - serwis do operacji I/O
        - FilesystemContext - React Context do zarządzania stanem
    - uiforms - moduł systemu UI inspirowany Godotem
        - models/ - interfejsy modeli danych
          - UIControlModel - bazowy model kontrolki z anchors, offsets, presets, sizeFlags
          - UIFormModel - model formularza (root control, settings, callbacks, dataSchema)
          - UILayoutModels - modele kontenerów (VBox, HBox, Grid, Tabs, Accordion)
          - UIInputModels - modele kontrolek (Label, Button, Input, Checkbox, Select...)
          - UIPickerModels - modele picker'ów danych (PersonPicker, TaskPicker, ProjectPicker)
        - nodes/ - klasy Node z UI state
          - UIControlNode extends NodeBase
        - renderer/ - renderowanie drzewa kontrolek
          - UIFormRenderer - główny renderer formularza
          - UIControlRenderer - renderer pojedynczej kontrolki
          - UIAnchorLayout - system CSS dla anchors/offsets (Godot-like positioning)
          - controls/ - implementacje kontrolek
            - containers/ - UIVBox, UIHBox, UIGrid, UIScroll, UIMargin
            - basic/ - UILabel, UIButton, UIInput, UITextarea, UICheckbox, UIRadio, UISelect
            - pickers/ - UIPersonPicker, UITaskPicker, UIProjectPicker
            - advanced/ - UITabs, UIAccordion, UISlider, UIProgress, UITable
            - registry.ts - rejestr komponentów
        - designer/ - visual designer (drag & drop)
          - UIFormDesigner - główny komponent designera
          - UIDesignerCanvas - canvas z dropzones
          - UIDesignerToolbox - paleta kontrolek
          - UIDesignerProperties - panel właściwości
          - UIDesignerTree - drzewo hierarchii
          - UIDesignerContext - context stanu designera
          - hooks/ - useDragDrop, useSelection, useHistory (undo/redo)
        - binding/ - data binding
          - UIFormContext - context danych formularza
          - useUIBinding - hook reaktywnego bindingu (oneWay, twoWay, oneTime)
          - UICallbackRegistry - rejestr callback'ów (onClick, onChange, onSubmit)
        - services/
          - UIFormService - CRUD dla formularzy (load/save z data/ui_forms.json)
    - definiuje następujące reużywalne komponenty react
      - dane z następujących model:
        - PersonModel z pliku /data/data/persons
        - TaskModel z pliku /data/data/tasks
        - ProjectModel z pliku /data/data/projects
      - natępujące typy model
        - Label
          - wygladem przypomina przycisk z ikoną typu np Person
          - nie edytowalny
          - majacy props: (id np z PersonModel)
        - Picker np. PersonPicker
          - wygladem przypomina przycisk z ikoną typu np Person
          - majacy props: editable, id (id np z PersonModel)
          - gdy editable po kliknieciu wywołujacy modal z możliwością wyboru
      - ObjectSearch - widok przeszukujący opiekty w DataSource na podstawie ich właściwości (możliwośc dodania warunków and, or, not),
      zwracający liste
- składa się z następujących stron
    - /filesystem/save - formularz zapisujący dane do pliku
    - /filesystem/list - widok podzielony z lewej drzewo danych po pliknieciu 
    - /calendar - widok kalendarza
    - /todolist - widok z taskami do zrobienia
    - /components - widok demonstrujący reużywalne komponenty UI te z katalogów person, project, task
    - /editor/simple/{path} - wydok na bełny ekran edytora monaco do edycji plików 
      z filesystem: json, md
    - /viewer/md/{path} - renderowanie zawartości plików md
    pobierz dane i wyswietl, po prawej widok wczytanych danych
    - /objectviewer - oparty na podstawie ObjectSearch wyświetlający listę objektów
    - /designer/ui/:id - visual designer formularzy UI (drag & drop)
    - /viewer/ui/:id - podgląd formularza UI
- rozszerzenia edytora markdown (mdeditor)
    - UIFormExtension - osadzanie formularzy UI w markdown
      - format referencji: @[uiform:form-id]
      - format inline: @[uiform:{...json...}]
      - slash command: /form
    - integracja z markdownConverter.ts (serializacja/deserializacja)

## Directory Structure
- `src/backend/`: Backend source code (TypeScript)
  - `modules/filesystem/`: File system module with in-memory cache
  - `modules/mqttserver/`: MQTT server with Client and Packet classes
  - `types/`: TypeScript type definitions
- `src/client/`: Frontend React application (TypeScript)
  - `src/modules/mqttclient/`: MQTT client module
  - `src/modules/filesystem/`: Filesystem module
    - `data/`: Data classes (DirData, FileData)
    - `models/`: Model interfaces (DirModel, FileModel, ProjectModel, TaskModel)
    - `nodes/` : nodes class extend models of additional states and functions
    - `components/`: components class (FileComponent, DirComponent, FileJsonComponent)
  - `src/modules/uiforms/`: UI Forms module (Godot-like)
    - `models/`: UIControlModel, UIFormModel, UILayoutModels, UIInputModels, UIPickerModels
    - `nodes/`: UIControlNode extends NodeBase
    - `renderer/`: UIFormRenderer, UIControlRenderer, UIAnchorLayout
      - `controls/`: containers/, basic/, pickers/, advanced/, registry.ts
    - `designer/`: UIFormDesigner, UIDesignerCanvas, UIDesignerToolbox, UIDesignerProperties
    - `binding/`: UIFormContext, useUIBinding, UICallbackRegistry
    - `services/`: UIFormService
  - `src/pages/filesystem/`: Filesystem pages (save, list)
  - `src/pages/designer/`: UI Designer pages
  - `src/components/`: Reusable UI components
    - `person/` - components of PersonModel
    - `project/` - components of ProjectModel
    - `task/` - components of TaskModel
  - `src/components/mdeditor/extensions/`: Markdown editor extensions
    - `UIFormExtension.tsx` - embedding UI forms in markdown
- `tests/`: Automated tests
- `docs/`: Project documentation
- `configs/`: Configuration files (YAML, JSON, .env, etc.)
- `scripts/`: Utility / automation scripts
- `assets/`: Images, fonts, or other static resources
- `dist/`: Compiled backend code
- `data/`: Runtime data directory (configurable via ROOT_DIR env)
  - `ui_forms.json`: UI Forms definitions (UIFormsModel)

## Development Workflow & Commands
- **Setup:** `npm install` (backend), `cd src/client && npm install` (frontend)
- **Run backend:** `npm run dev` (API on 3001, MQTT on 1893)
- **Run frontend:** `cd src/client && npm start`
- **Test:** `npm test`
- **Lint/Format:** `eslint .`
- **Build:** `npm run build`

## Code Style & Principles
### General
- **Formatting:** Enforce automated formatting/linting (Prettier)
- **Naming:** cammel case
- **Documentation:** Keep docstrings/comments focused on **"why"**, not **"what"**
- **Modularity:** Functions/components/services should have a single responsibility
- **Imports/dependencies:** Prefer clarity over brevity; avoid hidden magic

### Language/Stack Specific
Typescript with imports

## Environment & Dependencies
- **Languages/versions:** Node 20, TypeScript
- **Package manager:** npm
- **Frontend Framework:** React with TypeScript, Material UI
- **Backend Libraries:** Aedes (MQTT), dotenv
- **External services:** MQTT broker

## Common Gotchas
- **General:** Don't hardcode secrets; always use environment configs.
- **TypeScript:** Ensure proper type definitions for MQTT and filesystem operations to avoid runtime errors.
- **MQTT:** Use unique client IDs to avoid connection conflicts.
- **Frontend:** Handle async operations (e.g., MQTT subscriptions) properly in React components.
