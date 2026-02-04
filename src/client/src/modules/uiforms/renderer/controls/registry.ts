/**
 * Control Registry - rejestr komponentów UI
 */

import React from 'react';
import { UIControlModel, UIControlType } from '../../models';

// Material UI Icons
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewStreamIcon from '@mui/icons-material/ViewStream';
import ViewWeekIcon from '@mui/icons-material/ViewWeek';
import GridViewIcon from '@mui/icons-material/GridView';
import PaddingIcon from '@mui/icons-material/Padding';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import SmartButtonIcon from '@mui/icons-material/SmartButton';
import InputIcon from '@mui/icons-material/Input';
import NotesIcon from '@mui/icons-material/Notes';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import PersonIcon from '@mui/icons-material/Person';
import TaskIcon from '@mui/icons-material/Task';
import FolderIcon from '@mui/icons-material/Folder';
import TabIcon from '@mui/icons-material/Tab';
import ExpandIcon from '@mui/icons-material/Expand';
import LinearScaleIcon from '@mui/icons-material/LinearScale';
import DataUsageIcon from '@mui/icons-material/DataUsage';
import TableChartIcon from '@mui/icons-material/TableChart';
import WidgetsIcon from '@mui/icons-material/Widgets';
import { SvgIconProps } from '@mui/material';

// Typ komponentu kontrolki
export type UIControlComponent = React.FC<{
  control: UIControlModel;
  children?: React.ReactNode;
}>;

// Typ ikony - komponent React
export type IconComponent = React.ComponentType<SvgIconProps>;

// Metadane kontrolki dla toolbox
export interface UIControlMetadata {
  type: UIControlType;
  label: string;
  icon: IconComponent;
  category: UIControlCategory;
  description: string;
  canHaveChildren: boolean;
  defaultProperties?: Record<string, unknown>;
  defaultOffsets?: { left: number; top: number; right: number; bottom: number };
}

export type UIControlCategory = 'containers' | 'basic' | 'pickers' | 'advanced';

// Registry singleton
class ControlRegistry {
  private components = new Map<UIControlType, UIControlComponent>();
  private metadata = new Map<UIControlType, UIControlMetadata>();

  /**
   * Zarejestruj komponent kontrolki
   */
  register(type: UIControlType, component: UIControlComponent, meta?: Partial<UIControlMetadata>): void {
    this.components.set(type, component);

    if (meta) {
      this.metadata.set(type, {
        type,
        label: meta.label || type,
        icon: meta.icon || WidgetsIcon,
        category: meta.category || 'basic',
        description: meta.description || '',
        canHaveChildren: meta.canHaveChildren ?? false,
        defaultProperties: meta.defaultProperties,
        defaultOffsets: meta.defaultOffsets,
      });
    }
  }

  /**
   * Pobierz komponent kontrolki
   */
  get(type: UIControlType): UIControlComponent | undefined {
    return this.components.get(type);
  }

  /**
   * Pobierz metadane kontrolki
   */
  getMetadata(type: UIControlType): UIControlMetadata | undefined {
    return this.metadata.get(type);
  }

  /**
   * Pobierz wszystkie zarejestrowane komponenty
   */
  getAll(): Map<UIControlType, UIControlComponent> {
    return new Map(this.components);
  }

  /**
   * Pobierz wszystkie metadane
   */
  getAllMetadata(): Map<UIControlType, UIControlMetadata> {
    return new Map(this.metadata);
  }

  /**
   * Pobierz kontrolki według kategorii
   */
  getByCategory(category: UIControlCategory): UIControlMetadata[] {
    const result: UIControlMetadata[] = [];
    for (const meta of this.metadata.values()) {
      if (meta.category === category) {
        result.push(meta);
      }
    }
    return result;
  }

  /**
   * Sprawdź czy kontrolka jest zarejestrowana
   */
  has(type: UIControlType): boolean {
    return this.components.has(type);
  }

  /**
   * Pobierz listę wszystkich typów kontrolek
   */
  getTypes(): UIControlType[] {
    return Array.from(this.components.keys());
  }

  /**
   * Pobierz kategorie z kontrolkami
   */
  getCategories(): { category: UIControlCategory; controls: UIControlMetadata[] }[] {
    const categories: UIControlCategory[] = ['containers', 'basic', 'pickers', 'advanced'];
    return categories.map(category => ({
      category,
      controls: this.getByCategory(category),
    }));
  }
}

// Singleton export
export const controlRegistry = new ControlRegistry();

// Helper do rejestracji komponentu
export function registerControl(
  type: UIControlType,
  component: UIControlComponent,
  meta?: Partial<UIControlMetadata>
): void {
  controlRegistry.register(type, component, meta);
}

// Predefiniowane metadane dla wszystkich kontrolek
export const CONTROL_METADATA: Record<UIControlType, UIControlMetadata> = {
  // Kontenery
  container: {
    type: 'container',
    label: 'Container',
    icon: ViewModuleIcon,
    category: 'containers',
    description: 'Kontener z anchor layout',
    canHaveChildren: true,
    defaultOffsets: { left: 0, top: 0, right: 200, bottom: 200 },
  },
  vbox: {
    type: 'vbox',
    label: 'VBox',
    icon: ViewStreamIcon,
    category: 'containers',
    description: 'Pionowy layout (kolumna)',
    canHaveChildren: true,
    defaultProperties: { gap: 8 },
    defaultOffsets: { left: 0, top: 0, right: 200, bottom: 200 },
  },
  hbox: {
    type: 'hbox',
    label: 'HBox',
    icon: ViewWeekIcon,
    category: 'containers',
    description: 'Poziomy layout (wiersz)',
    canHaveChildren: true,
    defaultProperties: { gap: 8 },
    defaultOffsets: { left: 0, top: 0, right: 300, bottom: 50 },
  },
  grid: {
    type: 'grid',
    label: 'Grid',
    icon: GridViewIcon,
    category: 'containers',
    description: 'Siatka layout',
    canHaveChildren: true,
    defaultProperties: { columns: 2, gap: 8 },
    defaultOffsets: { left: 0, top: 0, right: 300, bottom: 200 },
  },
  margin: {
    type: 'margin',
    label: 'Margin',
    icon: PaddingIcon,
    category: 'containers',
    description: 'Kontener z marginesami',
    canHaveChildren: true,
    defaultProperties: { marginLeft: 16, marginTop: 16, marginRight: 16, marginBottom: 16 },
  },
  scroll: {
    type: 'scroll',
    label: 'Scroll',
    icon: UnfoldMoreIcon,
    category: 'containers',
    description: 'Przewijalny kontener',
    canHaveChildren: true,
    defaultProperties: { vertical: true },
    defaultOffsets: { left: 0, top: 0, right: 300, bottom: 200 },
  },

  // Bazowe
  label: {
    type: 'label',
    label: 'Label',
    icon: TextFieldsIcon,
    category: 'basic',
    description: 'Tekst / nagłówek',
    canHaveChildren: false,
    defaultProperties: { text: 'Label', variant: 'body1' },
    defaultOffsets: { left: 0, top: 0, right: 100, bottom: 24 },
  },
  button: {
    type: 'button',
    label: 'Button',
    icon: SmartButtonIcon,
    category: 'basic',
    description: 'Przycisk akcji',
    canHaveChildren: false,
    defaultProperties: { text: 'Button', variant: 'contained' },
    defaultOffsets: { left: 0, top: 0, right: 100, bottom: 36 },
  },
  input: {
    type: 'input',
    label: 'Input',
    icon: InputIcon,
    category: 'basic',
    description: 'Pole tekstowe',
    canHaveChildren: false,
    defaultProperties: { label: 'Input', variant: 'outlined' },
    defaultOffsets: { left: 0, top: 0, right: 200, bottom: 56 },
  },
  textarea: {
    type: 'textarea',
    label: 'Textarea',
    icon: NotesIcon,
    category: 'basic',
    description: 'Wieloliniowe pole tekstowe',
    canHaveChildren: false,
    defaultProperties: { label: 'Textarea', rows: 4, variant: 'outlined' },
    defaultOffsets: { left: 0, top: 0, right: 200, bottom: 120 },
  },
  checkbox: {
    type: 'checkbox',
    label: 'Checkbox',
    icon: CheckBoxIcon,
    category: 'basic',
    description: 'Pole wyboru',
    canHaveChildren: false,
    defaultProperties: { label: 'Checkbox' },
    defaultOffsets: { left: 0, top: 0, right: 150, bottom: 42 },
  },
  radio: {
    type: 'radio',
    label: 'Radio',
    icon: RadioButtonCheckedIcon,
    category: 'basic',
    description: 'Grupa radio button',
    canHaveChildren: false,
    defaultProperties: { label: 'Options', options: [{ value: '1', label: 'Option 1' }, { value: '2', label: 'Option 2' }] },
    defaultOffsets: { left: 0, top: 0, right: 200, bottom: 80 },
  },
  select: {
    type: 'select',
    label: 'Select',
    icon: ArrowDropDownIcon,
    category: 'basic',
    description: 'Lista rozwijana',
    canHaveChildren: false,
    defaultProperties: { label: 'Select', options: [{ value: '1', label: 'Option 1' }, { value: '2', label: 'Option 2' }] },
    defaultOffsets: { left: 0, top: 0, right: 200, bottom: 56 },
  },

  // Picker'y
  personPicker: {
    type: 'personPicker',
    label: 'Person Picker',
    icon: PersonIcon,
    category: 'pickers',
    description: 'Wybór osoby',
    canHaveChildren: false,
    defaultProperties: { editable: true },
    defaultOffsets: { left: 0, top: 0, right: 200, bottom: 40 },
  },
  taskPicker: {
    type: 'taskPicker',
    label: 'Task Picker',
    icon: TaskIcon,
    category: 'pickers',
    description: 'Wybór zadania',
    canHaveChildren: false,
    defaultProperties: { editable: true },
    defaultOffsets: { left: 0, top: 0, right: 200, bottom: 40 },
  },
  projectPicker: {
    type: 'projectPicker',
    label: 'Project Picker',
    icon: FolderIcon,
    category: 'pickers',
    description: 'Wybór projektu',
    canHaveChildren: false,
    defaultProperties: { editable: true },
    defaultOffsets: { left: 0, top: 0, right: 200, bottom: 40 },
  },

  // Zaawansowane
  tabs: {
    type: 'tabs',
    label: 'Tabs',
    icon: TabIcon,
    category: 'advanced',
    description: 'Zakładki',
    canHaveChildren: false,
    defaultProperties: {
      tabs: [
        { id: 'tab1', label: 'Tab 1', content: { type: 'ui_control', id: 'tab1-content', name: 'Tab 1 Content', controlType: 'vbox', anchors: { left: 0, top: 0, right: 1, bottom: 1 }, offsets: { left: 0, top: 0, right: 0, bottom: 0 } } },
        { id: 'tab2', label: 'Tab 2', content: { type: 'ui_control', id: 'tab2-content', name: 'Tab 2 Content', controlType: 'vbox', anchors: { left: 0, top: 0, right: 1, bottom: 1 }, offsets: { left: 0, top: 0, right: 0, bottom: 0 } } },
      ],
    },
    defaultOffsets: { left: 0, top: 0, right: 300, bottom: 200 },
  },
  accordion: {
    type: 'accordion',
    label: 'Accordion',
    icon: ExpandIcon,
    category: 'advanced',
    description: 'Rozwijane sekcje',
    canHaveChildren: false,
    defaultProperties: {
      items: [
        { id: 'item1', header: 'Section 1', content: { type: 'ui_control', id: 'item1-content', name: 'Section 1 Content', controlType: 'vbox', anchors: { left: 0, top: 0, right: 1, bottom: 1 }, offsets: { left: 0, top: 0, right: 0, bottom: 0 } } },
        { id: 'item2', header: 'Section 2', content: { type: 'ui_control', id: 'item2-content', name: 'Section 2 Content', controlType: 'vbox', anchors: { left: 0, top: 0, right: 1, bottom: 1 }, offsets: { left: 0, top: 0, right: 0, bottom: 0 } } },
      ],
    },
    defaultOffsets: { left: 0, top: 0, right: 300, bottom: 200 },
  },
  slider: {
    type: 'slider',
    label: 'Slider',
    icon: LinearScaleIcon,
    category: 'advanced',
    description: 'Suwak',
    canHaveChildren: false,
    defaultProperties: { min: 0, max: 100, value: 50 },
    defaultOffsets: { left: 0, top: 0, right: 200, bottom: 40 },
  },
  progress: {
    type: 'progress',
    label: 'Progress',
    icon: DataUsageIcon,
    category: 'advanced',
    description: 'Pasek postępu',
    canHaveChildren: false,
    defaultProperties: { value: 50, variant: 'determinate' },
    defaultOffsets: { left: 0, top: 0, right: 200, bottom: 20 },
  },
  table: {
    type: 'table',
    label: 'Table',
    icon: TableChartIcon,
    category: 'advanced',
    description: 'Tabela danych',
    canHaveChildren: false,
    defaultProperties: {
      columns: [
        { id: 'col1', header: 'Column 1', field: 'col1' },
        { id: 'col2', header: 'Column 2', field: 'col2' },
      ],
      data: [],
    },
    defaultOffsets: { left: 0, top: 0, right: 400, bottom: 300 },
  },
};
