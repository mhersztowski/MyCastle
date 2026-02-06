# UI Forms - Dokumentacja

System formularzy UI inspirowany silnikiem Godot, umożliwiający tworzenie interaktywnych interfejsów z wykorzystaniem systemu anchors/offsets i data bindingu.

## Spis treści

1. [Architektura](#architektura)
2. [Model formularza](#model-formularza)
3. [System pozycjonowania](#system-pozycjonowania)
4. [Data binding](#data-binding)
5. [Kontrolki kontenerowe](#kontrolki-kontenerowe)
6. [Kontrolki podstawowe](#kontrolki-podstawowe)
7. [Kontrolki picker](#kontrolki-picker)
8. [Kontrolki zaawansowane](#kontrolki-zaawansowane)
9. [Przykłady](#przykłady)

---

## Architektura

### Struktura modułu

```
src/client/src/modules/uiforms/
├── models/           # Interfejsy modeli danych
├── nodes/            # Klasy Node z logiką runtime
├── renderer/         # Komponenty renderujące
│   └── controls/     # Implementacje kontrolek
├── binding/          # System data bindingu
├── designer/         # Visual designer (drag & drop)
└── services/         # CRUD dla formularzy
```

### Kategorie kontrolek

| Kategoria | Kontrolki | Opis |
|-----------|-----------|------|
| **Containers** | container, vbox, hbox, grid, margin, scroll | Kontenery layoutu |
| **Basic** | label, button, input, textarea, checkbox, radio, select | Podstawowe inputy |
| **Pickers** | personPicker, taskPicker, projectPicker | Wybór danych z systemu |
| **Advanced** | tabs, accordion, slider, progress, table | Zaawansowane komponenty |

**Łącznie: 21 typów kontrolek**

---

## Model formularza

### UIFormModel

```typescript
interface UIFormModel {
  type: 'ui_form';
  id: string;                    // Unikalny identyfikator
  name: string;                  // Nazwa formularza
  description?: string;          // Opis
  version: string;               // Wersja (np. '1.0')
  root: UIControlModel;          // Główna kontrolka (kontener)
  settings?: UIFormSettings;     // Ustawienia formularza
  callbacks?: Record<string, UICallbackDefinition>;  // Callbacki
  dataSchema?: Record<string, UIDataField>;          // Schemat danych
}

interface UIFormSettings {
  width?: number | string;       // Szerokość formularza
  height?: number | string;      // Wysokość formularza
  backgroundColor?: string;      // Kolor tła
  padding?: number;              // Padding wewnętrzny
}

interface UIDataField {
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
  default?: unknown;             // Wartość domyślna
  required?: boolean;            // Czy wymagane
  validation?: string;           // Regex/funkcja walidacji
}
```

### UIControlModel (bazowy)

```typescript
interface UIControlModel {
  type: 'ui_control';
  id: string;                    // Unikalny identyfikator
  name: string;                  // Nazwa kontrolki
  controlType: UIControlType;    // Typ kontrolki
  visible?: boolean;             // Czy widoczna (default: true)
  disabled?: boolean;            // Czy wyłączona (default: false)
  children?: UIControlModel[];   // Dzieci (dla kontenerów)
  properties?: Record<string, unknown>;  // Właściwości specyficzne
  binding?: UIDataBinding;       // Data binding
  events?: UIEventBindings;      // Event handlery

  // System pozycjonowania (Godot-like)
  anchors?: UIAnchors;
  offsets?: UIOffsets;
  anchorPreset?: UIAnchorPreset;
  minSize?: UIMinSize;
  sizeFlags?: UISizeFlags;
}
```

---

## System pozycjonowania

System inspirowany silnikiem Godot, używający anchors i offsets do responsywnego pozycjonowania.

### Anchors

Znormalizowane pozycje (0-1) względem rodzica:

```typescript
interface UIAnchors {
  left: number;    // 0 = lewa krawędź, 1 = prawa krawędź
  top: number;     // 0 = górna krawędź, 1 = dolna krawędź
  right: number;
  bottom: number;
}
```

### Offsets

Przesunięcia w pikselach od punktów anchor:

```typescript
interface UIOffsets {
  left: number;    // Piksele od lewego anchora
  top: number;     // Piksele od górnego anchora
  right: number;   // Piksele od prawego anchora
  bottom: number;  // Piksele od dolnego anchora
}
```

### Anchor Presets

Predefiniowane konfiguracje pozycjonowania:

| Preset | Opis |
|--------|------|
| `topLeft` | Górny lewy róg |
| `topRight` | Górny prawy róg |
| `bottomLeft` | Dolny lewy róg |
| `bottomRight` | Dolny prawy róg |
| `centerLeft` | Środek lewej krawędzi |
| `centerRight` | Środek prawej krawędzi |
| `centerTop` | Środek górnej krawędzi |
| `centerBottom` | Środek dolnej krawędzi |
| `center` | Środek kontenera |
| `leftWide` | Rozciągnięty w pionie po lewej |
| `topWide` | Rozciągnięty w poziomie u góry |
| `rightWide` | Rozciągnięty w pionie po prawej |
| `bottomWide` | Rozciągnięty w poziomie na dole |
| `vcenterWide` | Środek poziomo, rozciągnięty pionowo |
| `hcenterWide` | Środek pionowo, rozciągnięty poziomo |
| `fullRect` | Wypełnia cały kontener |
| `custom` | Własna konfiguracja |

### Size Flags

Kontrola rozmiaru w kontenerach flex:

```typescript
interface UISizeFlags {
  horizontal?: 'fill' | 'expand' | 'shrinkCenter' | 'shrinkEnd';
  vertical?: 'fill' | 'expand' | 'shrinkCenter' | 'shrinkEnd';
  stretchRatio?: number;  // Proporcja przy expand
}
```

---

## Data binding

### Tryby bindingu

```typescript
interface UIDataBinding {
  field: string;              // Ścieżka do pola (np. "person.name")
  mode: 'oneWay' | 'twoWay' | 'oneTime';
  transform?: string;         // Opcjonalna funkcja transformacji
}
```

| Tryb | Opis | Zastosowanie |
|------|------|--------------|
| `oneWay` | Dane → kontrolka | Wyświetlanie (label, progress) |
| `twoWay` | Dane ↔ kontrolka | Edycja (input, select, checkbox) |
| `oneTime` | Jednorazowe załadowanie | Dane inicjalizacyjne |

### Ścieżki do pól

```typescript
// Proste pola
{ field: "name", mode: "twoWay" }

// Zagnieżdżone obiekty
{ field: "person.address.city", mode: "twoWay" }

// Indeksy tablic
{ field: "items[0].value", mode: "twoWay" }
```

### Event bindings

```typescript
interface UIEventBindings {
  onClick?: string;     // Nazwa callbacka
  onChange?: string;
  onFocus?: string;
  onBlur?: string;
  onSubmit?: string;
}
```

---

## Kontrolki kontenerowe

### Container (generic)

Bazowy kontener z pozycjonowaniem anchor.

```typescript
// Właściwości: brak specyficznych
// Dzieci pozycjonowane absolutnie via anchors/offsets
```

**Przykład:**
```json
{
  "controlType": "container",
  "anchorPreset": "fullRect",
  "children": [...]
}
```

---

### VBox (vertical layout)

Układa dzieci pionowo (flexbox column).

```typescript
interface UIVBoxProperties {
  gap?: number;                    // Odstęp między dziećmi (px)
  alignment?: 'start' | 'center' | 'end' | 'stretch';
  padding?: number;                // Padding wewnętrzny (px)
}
```

**Przykład:**
```json
{
  "controlType": "vbox",
  "properties": {
    "gap": 16,
    "alignment": "stretch",
    "padding": 8
  },
  "children": [
    { "controlType": "label", "properties": { "text": "Tytuł" } },
    { "controlType": "input", "properties": { "label": "Imię" } },
    { "controlType": "input", "properties": { "label": "Email" } }
  ]
}
```

---

### HBox (horizontal layout)

Układa dzieci poziomo (flexbox row).

```typescript
interface UIHBoxProperties {
  gap?: number;                    // Odstęp między dziećmi (px)
  alignment?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'spaceBetween' | 'spaceAround';
  wrap?: boolean;                  // Zawijanie wierszy
  padding?: number;
}
```

**Przykład:**
```json
{
  "controlType": "hbox",
  "properties": {
    "gap": 8,
    "justify": "spaceBetween"
  },
  "children": [
    { "controlType": "button", "properties": { "text": "Anuluj", "variant": "outlined" } },
    { "controlType": "button", "properties": { "text": "Zapisz", "variant": "contained" } }
  ]
}
```

---

### Grid (grid layout)

Układ siatkowy.

```typescript
interface UIGridProperties {
  columns: number;                 // Liczba kolumn (wymagane)
  rows?: number;                   // Liczba wierszy (opcjonalne)
  gap?: number;                    // Odstęp ogólny (px)
  columnGap?: number;              // Odstęp między kolumnami
  rowGap?: number;                 // Odstęp między wierszami
  padding?: number;
}
```

**Przykład:**
```json
{
  "controlType": "grid",
  "properties": {
    "columns": 2,
    "gap": 16
  },
  "children": [
    { "controlType": "input", "properties": { "label": "Imię" } },
    { "controlType": "input", "properties": { "label": "Nazwisko" } },
    { "controlType": "input", "properties": { "label": "Email" } },
    { "controlType": "input", "properties": { "label": "Telefon" } }
  ]
}
```

---

### Margin (margin wrapper)

Dodaje marginesy do zawartości.

```typescript
interface UIMarginProperties {
  marginLeft?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
}
```

**Przykład:**
```json
{
  "controlType": "margin",
  "properties": {
    "marginLeft": 24,
    "marginRight": 24,
    "marginTop": 16,
    "marginBottom": 16
  },
  "children": [...]
}
```

---

### Scroll (scrollable container)

Kontener z przewijaniem.

```typescript
interface UIScrollProperties {
  horizontal?: boolean;            // Przewijanie poziome
  vertical?: boolean;              // Przewijanie pionowe (default: true)
  alwaysShowScrollbar?: boolean;   // Zawsze pokazuj scrollbar
  maxHeight?: number | string;     // Max wysokość
  maxWidth?: number | string;
}
```

**Przykład:**
```json
{
  "controlType": "scroll",
  "properties": {
    "vertical": true,
    "maxHeight": 400
  },
  "children": [...]
}
```

---

## Kontrolki podstawowe

### Label

Wyświetla tekst/nagłówek.

```typescript
interface UILabelProperties {
  text: string;                    // Tekst (wymagane)
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' |
            'subtitle1' | 'subtitle2' | 'body1' | 'body2' |
            'caption' | 'overline';
  color?: string;                  // Kolor CSS
  align?: 'left' | 'center' | 'right';
  fontWeight?: 'normal' | 'medium' | 'bold';
  noWrap?: boolean;                // Bez zawijania
}
```

**Przykłady:**

```json
// Nagłówek
{
  "controlType": "label",
  "properties": {
    "text": "Formularz rejestracji",
    "variant": "h4",
    "align": "center"
  }
}

// Opis
{
  "controlType": "label",
  "properties": {
    "text": "Wypełnij wszystkie wymagane pola",
    "variant": "body2",
    "color": "text.secondary"
  }
}

// Z data bindingiem
{
  "controlType": "label",
  "properties": { "variant": "h5" },
  "binding": {
    "field": "person.fullName",
    "mode": "oneWay"
  }
}
```

---

### Button

Przycisk akcji.

```typescript
interface UIButtonProperties {
  text: string;                    // Tekst przycisku (wymagane)
  variant?: 'contained' | 'outlined' | 'text';
  color?: 'primary' | 'secondary' | 'success' | 'error' |
          'warning' | 'info' | 'inherit';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: string;                   // Nazwa ikony MUI (np. 'AddIcon')
  iconPosition?: 'start' | 'end';
  href?: string;                   // Link (opcjonalnie)
}
```

**Przykłady:**

```json
// Przycisk podstawowy
{
  "controlType": "button",
  "properties": {
    "text": "Zapisz",
    "variant": "contained",
    "color": "primary"
  },
  "events": {
    "onClick": "handleSave"
  }
}

// Przycisk z ikoną
{
  "controlType": "button",
  "properties": {
    "text": "Dodaj element",
    "variant": "outlined",
    "icon": "AddIcon",
    "iconPosition": "start"
  },
  "events": {
    "onClick": "handleAdd"
  }
}

// Przycisk usuwania
{
  "controlType": "button",
  "properties": {
    "text": "Usuń",
    "variant": "text",
    "color": "error",
    "size": "small"
  },
  "events": {
    "onClick": "handleDelete"
  }
}
```

---

### Input

Pole tekstowe jednoliniowe.

```typescript
interface UIInputProperties {
  placeholder?: string;
  label?: string;
  type?: 'text' | 'number' | 'email' | 'password' | 'tel' | 'url' | 'search';
  variant?: 'outlined' | 'filled' | 'standard';
  size?: 'small' | 'medium';
  disabled?: boolean;
  required?: boolean;
  fullWidth?: boolean;
  helperText?: string;
  errorText?: string;
  autoFocus?: boolean;
  maxLength?: number;
  minLength?: number;
  pattern?: string;                // Regex walidacji
}
```

**Przykłady:**

```json
// Podstawowy input
{
  "controlType": "input",
  "properties": {
    "label": "Imię",
    "required": true,
    "fullWidth": true
  },
  "binding": {
    "field": "firstName",
    "mode": "twoWay"
  }
}

// Input email
{
  "controlType": "input",
  "properties": {
    "label": "Email",
    "type": "email",
    "placeholder": "jan@example.com",
    "helperText": "Twój adres email"
  },
  "binding": {
    "field": "email",
    "mode": "twoWay"
  }
}

// Input hasła
{
  "controlType": "input",
  "properties": {
    "label": "Hasło",
    "type": "password",
    "minLength": 8,
    "helperText": "Minimum 8 znaków"
  },
  "binding": {
    "field": "password",
    "mode": "twoWay"
  }
}

// Input numeryczny
{
  "controlType": "input",
  "properties": {
    "label": "Wiek",
    "type": "number",
    "size": "small"
  },
  "binding": {
    "field": "age",
    "mode": "twoWay"
  }
}
```

---

### Textarea

Pole tekstowe wieloliniowe.

```typescript
interface UITextareaProperties {
  placeholder?: string;
  label?: string;
  variant?: 'outlined' | 'filled' | 'standard';
  size?: 'small' | 'medium';
  disabled?: boolean;
  required?: boolean;
  fullWidth?: boolean;
  helperText?: string;
  errorText?: string;
  rows?: number;                   // Domyślna liczba wierszy
  minRows?: number;                // Minimum (auto-expand)
  maxRows?: number;                // Maximum
  maxLength?: number;
}
```

**Przykłady:**

```json
// Textarea podstawowa
{
  "controlType": "textarea",
  "properties": {
    "label": "Opis",
    "rows": 4,
    "fullWidth": true
  },
  "binding": {
    "field": "description",
    "mode": "twoWay"
  }
}

// Auto-expanding textarea
{
  "controlType": "textarea",
  "properties": {
    "label": "Notatki",
    "minRows": 3,
    "maxRows": 10,
    "placeholder": "Dodaj notatki..."
  },
  "binding": {
    "field": "notes",
    "mode": "twoWay"
  }
}
```

---

### Checkbox

Pole wyboru (boolean).

```typescript
interface UICheckboxProperties {
  label?: string;
  checked?: boolean;
  disabled?: boolean;
  indeterminate?: boolean;         // Stan pośredni
  color?: 'primary' | 'secondary' | 'success' | 'error' |
          'warning' | 'info' | 'default';
  size?: 'small' | 'medium';
  labelPlacement?: 'end' | 'start' | 'top' | 'bottom';
}
```

**Przykłady:**

```json
// Checkbox podstawowy
{
  "controlType": "checkbox",
  "properties": {
    "label": "Akceptuję regulamin"
  },
  "binding": {
    "field": "acceptTerms",
    "mode": "twoWay"
  }
}

// Checkbox z kolorem
{
  "controlType": "checkbox",
  "properties": {
    "label": "Zadanie ukończone",
    "color": "success"
  },
  "binding": {
    "field": "completed",
    "mode": "twoWay"
  }
}
```

---

### Radio

Grupa radio (pojedynczy wybór).

```typescript
interface UIRadioProperties {
  label?: string;
  options: UIRadioOption[];        // Opcje (wymagane)
  value?: string;                  // Wybrana wartość
  disabled?: boolean;
  row?: boolean;                   // Układ poziomy
  color?: 'primary' | 'secondary' | 'success' | 'error' |
          'warning' | 'info' | 'default';
  size?: 'small' | 'medium';
}

interface UIRadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}
```

**Przykłady:**

```json
// Radio pionowe
{
  "controlType": "radio",
  "properties": {
    "label": "Priorytet",
    "options": [
      { "value": "low", "label": "Niski" },
      { "value": "medium", "label": "Średni" },
      { "value": "high", "label": "Wysoki" }
    ]
  },
  "binding": {
    "field": "priority",
    "mode": "twoWay"
  }
}

// Radio poziome
{
  "controlType": "radio",
  "properties": {
    "label": "Płeć",
    "row": true,
    "options": [
      { "value": "male", "label": "Mężczyzna" },
      { "value": "female", "label": "Kobieta" },
      { "value": "other", "label": "Inne" }
    ]
  },
  "binding": {
    "field": "gender",
    "mode": "twoWay"
  }
}
```

---

### Select

Lista rozwijana.

```typescript
interface UISelectProperties {
  label?: string;
  placeholder?: string;
  options: UISelectOption[];       // Opcje (wymagane)
  value?: string | string[];       // Wybrana wartość
  multiple?: boolean;              // Wielokrotny wybór
  disabled?: boolean;
  required?: boolean;
  fullWidth?: boolean;
  variant?: 'outlined' | 'filled' | 'standard';
  size?: 'small' | 'medium';
  helperText?: string;
  errorText?: string;
}

interface UISelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;                  // Opcjonalne grupowanie
}
```

**Przykłady:**

```json
// Select podstawowy
{
  "controlType": "select",
  "properties": {
    "label": "Kategoria",
    "fullWidth": true,
    "options": [
      { "value": "work", "label": "Praca" },
      { "value": "personal", "label": "Osobiste" },
      { "value": "shopping", "label": "Zakupy" }
    ]
  },
  "binding": {
    "field": "category",
    "mode": "twoWay"
  }
}

// Select z grupami
{
  "controlType": "select",
  "properties": {
    "label": "Kraj",
    "options": [
      { "value": "pl", "label": "Polska", "group": "Europa" },
      { "value": "de", "label": "Niemcy", "group": "Europa" },
      { "value": "us", "label": "USA", "group": "Ameryka" },
      { "value": "ca", "label": "Kanada", "group": "Ameryka" }
    ]
  },
  "binding": {
    "field": "country",
    "mode": "twoWay"
  }
}

// Multi-select
{
  "controlType": "select",
  "properties": {
    "label": "Tagi",
    "multiple": true,
    "options": [
      { "value": "urgent", "label": "Pilne" },
      { "value": "important", "label": "Ważne" },
      { "value": "review", "label": "Do przeglądu" }
    ]
  },
  "binding": {
    "field": "tags",
    "mode": "twoWay"
  }
}
```

---

## Kontrolki picker

Kontrolki do wyboru danych z systemu MyCastle.

### Wspólne właściwości

```typescript
interface UIPickerBaseProperties {
  editable?: boolean;              // Możliwość edycji (default: true)
  size?: 'small' | 'medium';
  showClearButton?: boolean;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  fullWidth?: boolean;
  variant?: 'chip' | 'outlined' | 'standard';
}
```

---

### PersonPicker

Wybór osoby z systemu.

```typescript
interface UIPersonPickerProperties extends UIPickerBaseProperties {
  value?: string;                  // ID osoby
  filter?: string;                 // Filtr zapytania
  showAvatar?: boolean;
  showNick?: boolean;
}
```

**Przykład:**

```json
{
  "controlType": "personPicker",
  "properties": {
    "placeholder": "Wybierz osobę",
    "showAvatar": true,
    "fullWidth": true
  },
  "binding": {
    "field": "assignee",
    "mode": "twoWay"
  }
}
```

---

### TaskPicker

Wybór zadania z systemu.

```typescript
interface UITaskPickerProperties extends UIPickerBaseProperties {
  value?: string;                  // ID zadania
  projectFilter?: string;          // Filtr po projekcie
  showUnassigned?: boolean;
  showProjectName?: boolean;
  showStatus?: boolean;
}
```

**Przykład:**

```json
{
  "controlType": "taskPicker",
  "properties": {
    "placeholder": "Wybierz zadanie",
    "showProjectName": true,
    "showStatus": true
  },
  "binding": {
    "field": "relatedTask",
    "mode": "twoWay"
  }
}
```

---

### ProjectPicker

Wybór projektu z systemu.

```typescript
interface UIProjectPickerProperties extends UIPickerBaseProperties {
  value?: string;                  // ID projektu
  showNested?: boolean;            // Hierarchia zagnieżdżona
  showTaskCount?: boolean;
  maxDepth?: number;               // Limit głębokości
}
```

**Przykład:**

```json
{
  "controlType": "projectPicker",
  "properties": {
    "placeholder": "Wybierz projekt",
    "showNested": true,
    "showTaskCount": true
  },
  "binding": {
    "field": "project",
    "mode": "twoWay"
  }
}
```

---

## Kontrolki zaawansowane

### Slider

Suwak numeryczny.

```typescript
interface UISliderProperties {
  min?: number;                    // Minimum (default: 0)
  max?: number;                    // Maximum (default: 100)
  step?: number;                   // Krok (default: 1)
  value?: number | number[];       // Wartość (lub zakres)
  marks?: boolean | UISliderMark[];  // Znaczniki
  disabled?: boolean;
  orientation?: 'horizontal' | 'vertical';
  valueLabelDisplay?: 'auto' | 'on' | 'off';
  color?: 'primary' | 'secondary';
  size?: 'small' | 'medium';
  track?: 'normal' | 'inverted' | false;
}

interface UISliderMark {
  value: number;
  label?: string;
}
```

**Przykłady:**

```json
// Slider podstawowy
{
  "controlType": "slider",
  "properties": {
    "min": 0,
    "max": 100,
    "valueLabelDisplay": "auto"
  },
  "binding": {
    "field": "progress",
    "mode": "twoWay"
  }
}

// Slider z markami
{
  "controlType": "slider",
  "properties": {
    "min": 0,
    "max": 5,
    "step": 1,
    "marks": [
      { "value": 0, "label": "0" },
      { "value": 1, "label": "1" },
      { "value": 2, "label": "2" },
      { "value": 3, "label": "3" },
      { "value": 4, "label": "4" },
      { "value": 5, "label": "5" }
    ]
  },
  "binding": {
    "field": "rating",
    "mode": "twoWay"
  }
}
```

---

### Progress

Pasek postępu.

```typescript
interface UIProgressProperties {
  value?: number;                  // Wartość 0-100
  variant?: 'determinate' | 'indeterminate' | 'buffer' | 'query';
  color?: 'primary' | 'secondary' | 'success' | 'error' |
          'warning' | 'info' | 'inherit';
  type?: 'linear' | 'circular';
  size?: number;                   // Rozmiar (circular)
  thickness?: number;              // Grubość (circular)
  showLabel?: boolean;             // Pokaż procent
}
```

**Przykłady:**

```json
// Progress linearny
{
  "controlType": "progress",
  "properties": {
    "type": "linear",
    "variant": "determinate",
    "showLabel": true
  },
  "binding": {
    "field": "completion",
    "mode": "oneWay"
  }
}

// Progress kołowy
{
  "controlType": "progress",
  "properties": {
    "type": "circular",
    "size": 60,
    "thickness": 4
  },
  "binding": {
    "field": "uploadProgress",
    "mode": "oneWay"
  }
}

// Indeterminate (loading)
{
  "controlType": "progress",
  "properties": {
    "type": "linear",
    "variant": "indeterminate",
    "color": "secondary"
  }
}
```

---

### Tabs

Interfejs zakładkowy.

```typescript
interface UITabsProperties {
  activeTab?: number;              // Aktywna zakładka (default: 0)
  tabs: UITabDefinition[];         // Definicje zakładek (wymagane)
  variant?: 'standard' | 'scrollable' | 'fullWidth';
  centered?: boolean;
}

interface UITabDefinition {
  id: string;
  label: string;
  icon?: string;                   // Nazwa ikony MUI
  disabled?: boolean;
  content: UIControlModel;         // Zawartość zakładki
}
```

**Przykład:**

```json
{
  "controlType": "tabs",
  "properties": {
    "variant": "fullWidth",
    "tabs": [
      {
        "id": "general",
        "label": "Ogólne",
        "icon": "InfoIcon",
        "content": {
          "controlType": "vbox",
          "properties": { "gap": 16, "padding": 16 },
          "children": [
            { "controlType": "input", "properties": { "label": "Nazwa" } },
            { "controlType": "textarea", "properties": { "label": "Opis" } }
          ]
        }
      },
      {
        "id": "settings",
        "label": "Ustawienia",
        "icon": "SettingsIcon",
        "content": {
          "controlType": "vbox",
          "properties": { "gap": 16, "padding": 16 },
          "children": [
            { "controlType": "checkbox", "properties": { "label": "Aktywny" } },
            { "controlType": "select", "properties": { "label": "Priorytet", "options": [...] } }
          ]
        }
      }
    ]
  }
}
```

---

### Accordion

Rozwijane sekcje.

```typescript
interface UIAccordionProperties {
  allowMultiple?: boolean;         // Wiele otwartych sekcji
  expandedItems?: string[];        // Początkowo otwarte
  items: UIAccordionItem[];        // Elementy (wymagane)
}

interface UIAccordionItem {
  id: string;
  header: string;                  // Nagłówek
  icon?: string;                   // Ikona MUI
  disabled?: boolean;
  defaultExpanded?: boolean;
  content: UIControlModel;         // Zawartość sekcji
}
```

**Przykład:**

```json
{
  "controlType": "accordion",
  "properties": {
    "allowMultiple": true,
    "items": [
      {
        "id": "basic",
        "header": "Informacje podstawowe",
        "defaultExpanded": true,
        "content": {
          "controlType": "vbox",
          "properties": { "gap": 12 },
          "children": [
            { "controlType": "input", "properties": { "label": "Imię" } },
            { "controlType": "input", "properties": { "label": "Nazwisko" } }
          ]
        }
      },
      {
        "id": "contact",
        "header": "Dane kontaktowe",
        "content": {
          "controlType": "vbox",
          "properties": { "gap": 12 },
          "children": [
            { "controlType": "input", "properties": { "label": "Email", "type": "email" } },
            { "controlType": "input", "properties": { "label": "Telefon", "type": "tel" } }
          ]
        }
      }
    ]
  }
}
```

---

### Table

Tabela danych z sortowaniem i paginacją.

```typescript
interface UITableProperties {
  columns: UITableColumn[];        // Kolumny (wymagane)
  data?: unknown[];                // Dane statyczne
  dataBinding?: string;            // Lub binding do danych
  selectable?: boolean;
  selectMode?: 'single' | 'multiple';
  pagination?: boolean;
  pageSize?: number;               // Wierszy na stronę (default: 10)
  pageSizeOptions?: number[];      // Dostępne rozmiary strony
  sortable?: boolean;
  stickyHeader?: boolean;
  size?: 'small' | 'medium';
  hover?: boolean;
}

interface UITableColumn {
  id: string;
  header: string;                  // Nagłówek kolumny
  field: string;                   // Ścieżka do pola danych
  width?: number | string;
  minWidth?: number;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  render?: string;                 // Nazwa funkcji renderującej
  format?: 'text' | 'number' | 'date' | 'currency' | 'boolean';
}
```

**Przykład:**

```json
{
  "controlType": "table",
  "properties": {
    "pagination": true,
    "pageSize": 10,
    "sortable": true,
    "stickyHeader": true,
    "hover": true,
    "columns": [
      { "id": "name", "header": "Nazwa", "field": "name", "sortable": true },
      { "id": "status", "header": "Status", "field": "status", "width": 100 },
      { "id": "date", "header": "Data", "field": "createdAt", "format": "date", "align": "right" },
      { "id": "amount", "header": "Kwota", "field": "amount", "format": "currency", "align": "right" }
    ],
    "dataBinding": "items"
  }
}
```

---

## Przykłady

### Formularz kontaktowy

```json
{
  "type": "ui_form",
  "id": "contact-form",
  "name": "Formularz kontaktowy",
  "version": "1.0",
  "settings": {
    "width": 400,
    "padding": 24
  },
  "dataSchema": {
    "name": { "type": "string", "required": true },
    "email": { "type": "string", "required": true },
    "message": { "type": "string", "required": true }
  },
  "root": {
    "controlType": "vbox",
    "properties": { "gap": 20 },
    "children": [
      {
        "controlType": "label",
        "properties": {
          "text": "Skontaktuj się z nami",
          "variant": "h5",
          "align": "center"
        }
      },
      {
        "controlType": "input",
        "properties": {
          "label": "Imię i nazwisko",
          "required": true,
          "fullWidth": true
        },
        "binding": { "field": "name", "mode": "twoWay" }
      },
      {
        "controlType": "input",
        "properties": {
          "label": "Email",
          "type": "email",
          "required": true,
          "fullWidth": true
        },
        "binding": { "field": "email", "mode": "twoWay" }
      },
      {
        "controlType": "textarea",
        "properties": {
          "label": "Wiadomość",
          "rows": 4,
          "required": true,
          "fullWidth": true
        },
        "binding": { "field": "message", "mode": "twoWay" }
      },
      {
        "controlType": "hbox",
        "properties": { "justify": "end", "gap": 8 },
        "children": [
          {
            "controlType": "button",
            "properties": { "text": "Anuluj", "variant": "outlined" },
            "events": { "onClick": "handleCancel" }
          },
          {
            "controlType": "button",
            "properties": { "text": "Wyślij", "variant": "contained" },
            "events": { "onClick": "handleSubmit" }
          }
        ]
      }
    ]
  },
  "callbacks": {
    "handleSubmit": {
      "type": "function",
      "code": "async (data, context) => { await context.api.sendEmail(data); }"
    },
    "handleCancel": {
      "type": "function",
      "code": "(data, context) => { context.navigate(-1); }"
    }
  }
}
```

---

### Formularz edycji zadania

```json
{
  "type": "ui_form",
  "id": "task-edit-form",
  "name": "Edycja zadania",
  "version": "1.0",
  "root": {
    "controlType": "vbox",
    "properties": { "gap": 16, "padding": 16 },
    "children": [
      {
        "controlType": "input",
        "properties": { "label": "Tytuł", "required": true, "fullWidth": true },
        "binding": { "field": "title", "mode": "twoWay" }
      },
      {
        "controlType": "textarea",
        "properties": { "label": "Opis", "minRows": 3, "fullWidth": true },
        "binding": { "field": "description", "mode": "twoWay" }
      },
      {
        "controlType": "grid",
        "properties": { "columns": 2, "gap": 16 },
        "children": [
          {
            "controlType": "select",
            "properties": {
              "label": "Status",
              "options": [
                { "value": "todo", "label": "Do zrobienia" },
                { "value": "in_progress", "label": "W trakcie" },
                { "value": "done", "label": "Zakończone" }
              ]
            },
            "binding": { "field": "status", "mode": "twoWay" }
          },
          {
            "controlType": "select",
            "properties": {
              "label": "Priorytet",
              "options": [
                { "value": "low", "label": "Niski" },
                { "value": "medium", "label": "Średni" },
                { "value": "high", "label": "Wysoki" }
              ]
            },
            "binding": { "field": "priority", "mode": "twoWay" }
          }
        ]
      },
      {
        "controlType": "personPicker",
        "properties": { "placeholder": "Przypisz do...", "fullWidth": true },
        "binding": { "field": "assignee", "mode": "twoWay" }
      },
      {
        "controlType": "projectPicker",
        "properties": { "placeholder": "Projekt", "fullWidth": true },
        "binding": { "field": "projectId", "mode": "twoWay" }
      },
      {
        "controlType": "hbox",
        "properties": { "justify": "end", "gap": 8 },
        "children": [
          {
            "controlType": "button",
            "properties": { "text": "Anuluj", "variant": "text" },
            "events": { "onClick": "cancel" }
          },
          {
            "controlType": "button",
            "properties": { "text": "Zapisz", "variant": "contained", "color": "primary" },
            "events": { "onClick": "save" }
          }
        ]
      }
    ]
  }
}
```

---

### Dashboard z zakładkami

```json
{
  "type": "ui_form",
  "id": "dashboard",
  "name": "Dashboard",
  "version": "1.0",
  "settings": { "width": "100%", "height": "100%" },
  "root": {
    "controlType": "tabs",
    "properties": {
      "variant": "scrollable",
      "tabs": [
        {
          "id": "overview",
          "label": "Przegląd",
          "icon": "DashboardIcon",
          "content": {
            "controlType": "grid",
            "properties": { "columns": 3, "gap": 16, "padding": 16 },
            "children": [
              {
                "controlType": "vbox",
                "properties": { "gap": 8 },
                "children": [
                  { "controlType": "label", "properties": { "text": "Aktywne zadania", "variant": "caption" } },
                  { "controlType": "label", "properties": { "variant": "h3" }, "binding": { "field": "stats.activeTasks", "mode": "oneWay" } }
                ]
              },
              {
                "controlType": "vbox",
                "properties": { "gap": 8 },
                "children": [
                  { "controlType": "label", "properties": { "text": "Ukończone", "variant": "caption" } },
                  { "controlType": "label", "properties": { "variant": "h3" }, "binding": { "field": "stats.completedTasks", "mode": "oneWay" } }
                ]
              },
              {
                "controlType": "vbox",
                "properties": { "gap": 8 },
                "children": [
                  { "controlType": "label", "properties": { "text": "Postęp", "variant": "caption" } },
                  { "controlType": "progress", "properties": { "type": "circular", "size": 60, "showLabel": true }, "binding": { "field": "stats.progress", "mode": "oneWay" } }
                ]
              }
            ]
          }
        },
        {
          "id": "tasks",
          "label": "Zadania",
          "icon": "TaskIcon",
          "content": {
            "controlType": "table",
            "properties": {
              "pagination": true,
              "sortable": true,
              "columns": [
                { "id": "title", "header": "Tytuł", "field": "title", "sortable": true },
                { "id": "status", "header": "Status", "field": "status", "width": 120 },
                { "id": "priority", "header": "Priorytet", "field": "priority", "width": 100 }
              ],
              "dataBinding": "tasks"
            }
          }
        }
      ]
    }
  }
}
```

---

## Użycie w kodzie

### Renderowanie formularza

```tsx
import { UIFormRenderer } from '../modules/uiforms/renderer/UIFormRenderer';
import { UIFormProvider } from '../modules/uiforms/binding/UIFormContext';

const MyComponent = () => {
  const [formData, setFormData] = useState({ name: '', email: '' });

  const handleChange = (newData) => {
    setFormData(newData);
  };

  return (
    <UIFormProvider
      data={formData}
      onChange={handleChange}
      mode="edit"
    >
      <UIFormRenderer form={myFormDefinition} />
    </UIFormProvider>
  );
};
```

### Osadzanie w markdown

Format referencji:
```
@[uiform:form-id]
```

Format inline:
```
@[uiform:{"type":"ui_form","id":"inline-form",...}]
```

---

## Zobacz też

- [Automate API](./automate.md) - automatyzacja z UI Forms
- [Conversation Actions](./conversation.md) - akcje konwersacyjne
