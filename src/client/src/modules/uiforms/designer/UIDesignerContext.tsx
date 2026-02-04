/**
 * UI Designer Context - stan i operacje designera
 */

import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { UIControlModel, UIFormModel, createControl, createForm } from '../models';
import { UIControlType } from '../models/UIControlModel';
import { CONTROL_METADATA } from '../renderer/controls/registry';

// Helper: generuj unikalne ID
const generateId = () => `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Historia dla undo/redo
interface HistoryEntry {
  form: UIFormModel;
  description: string;
}

// Stan designera
interface UIDesignerState {
  form: UIFormModel | null;
  selectedControlId: string | null;
  hoveredControlId: string | null;
  clipboardControl: UIControlModel | null;
  isDragging: boolean;
  draggedControlType: UIControlType | null;
  draggedControlId: string | null; // Dla przenoszenia istniejących kontrolek
  zoom: number;
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: number;
}

// Akcje designera
interface UIDesignerActions {
  // Form
  setForm: (form: UIFormModel | null) => void;
  createNewForm: (name: string) => void;
  updateFormSettings: (settings: Partial<UIFormModel['settings']>) => void;

  // Selection
  selectControl: (controlId: string | null) => void;
  hoverControl: (controlId: string | null) => void;

  // Control operations
  addControl: (parentId: string | null, type: UIControlType, index?: number) => UIControlModel | null;
  updateControl: (controlId: string, updates: Partial<UIControlModel>) => void;
  deleteControl: (controlId: string) => void;
  moveControl: (controlId: string, newParentId: string | null, index?: number) => void;
  duplicateControl: (controlId: string) => UIControlModel | null;

  // Clipboard
  copyControl: (controlId: string) => void;
  cutControl: (controlId: string) => void;
  pasteControl: (parentId: string | null) => UIControlModel | null;

  // Drag & Drop
  startDrag: (controlType: UIControlType | null, controlId?: string) => void;
  endDrag: () => void;

  // View
  setZoom: (zoom: number) => void;
  toggleGrid: () => void;
  toggleSnapToGrid: () => void;
  setGridSize: (size: number) => void;

  // History
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Helpers
  getControlById: (controlId: string) => UIControlModel | null;
  getParentControl: (controlId: string) => UIControlModel | null;
  getControlPath: (controlId: string) => string[];
}

interface UIDesignerContextType extends UIDesignerState, UIDesignerActions {}

const UIDesignerContext = createContext<UIDesignerContextType | null>(null);

// Helper: deep clone with new IDs
const cloneControlWithNewIds = (control: UIControlModel): UIControlModel => {
  const newId = `control_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  return {
    ...control,
    id: newId,
    name: `${control.name}_copy`,
    children: control.children?.map(cloneControlWithNewIds),
  };
};

// Helper: znajdź kontrolkę po id
const findControlById = (root: UIControlModel, id: string): UIControlModel | null => {
  if (root.id === id) return root;
  if (root.children) {
    for (const child of root.children) {
      const found = findControlById(child, id);
      if (found) return found;
    }
  }
  return null;
};

// Helper: znajdź rodzica kontrolki
const findParentControl = (root: UIControlModel, id: string, parent: UIControlModel | null = null): UIControlModel | null => {
  if (root.id === id) return parent;
  if (root.children) {
    for (const child of root.children) {
      const found = findParentControl(child, id, root);
      if (found !== undefined) return found;
    }
  }
  return null;
};

// Helper: aktualizuj kontrolkę w drzewie
const updateControlInTree = (
  root: UIControlModel,
  id: string,
  updates: Partial<UIControlModel>
): UIControlModel => {
  if (root.id === id) {
    return { ...root, ...updates };
  }
  if (root.children) {
    return {
      ...root,
      children: root.children.map(child => updateControlInTree(child, id, updates)),
    };
  }
  return root;
};

// Helper: usuń kontrolkę z drzewa
const removeControlFromTree = (root: UIControlModel, id: string): UIControlModel | null => {
  if (root.id === id) return null;
  if (root.children) {
    const newChildren = root.children
      .map(child => removeControlFromTree(child, id))
      .filter((c): c is UIControlModel => c !== null);
    return { ...root, children: newChildren };
  }
  return root;
};

// Helper: dodaj kontrolkę do rodzica
const addControlToParent = (
  root: UIControlModel,
  parentId: string | null,
  control: UIControlModel,
  index?: number
): UIControlModel => {
  // Dodaj do roota
  if (parentId === null || root.id === parentId) {
    const children = root.children || [];
    const newChildren = index !== undefined
      ? [...children.slice(0, index), control, ...children.slice(index)]
      : [...children, control];
    return { ...root, children: newChildren };
  }

  // Szukaj w children
  if (root.children) {
    return {
      ...root,
      children: root.children.map(child => addControlToParent(child, parentId, control, index)),
    };
  }

  return root;
};

// Helper: przenieś kontrolkę
const moveControlInTree = (
  root: UIControlModel,
  controlId: string,
  newParentId: string | null,
  index?: number
): UIControlModel | null => {
  // Znajdź kontrolkę
  const control = findControlById(root, controlId);
  if (!control) return root;

  // Usuń z obecnej lokalizacji
  let newRoot = removeControlFromTree(root, controlId);
  if (!newRoot) return null;

  // Dodaj do nowej lokalizacji
  newRoot = addControlToParent(newRoot, newParentId, control, index);
  return newRoot;
};

// Helper: znajdź ścieżkę do kontrolki
const getControlPathInTree = (root: UIControlModel, id: string, path: string[] = []): string[] | null => {
  const currentPath = [...path, root.id];
  if (root.id === id) return currentPath;
  if (root.children) {
    for (const child of root.children) {
      const found = getControlPathInTree(child, id, currentPath);
      if (found) return found;
    }
  }
  return null;
};

// Provider props
interface UIDesignerProviderProps {
  children: ReactNode;
  initialForm?: UIFormModel | null;
  onChange?: (form: UIFormModel) => void;
}

export const UIDesignerProvider: React.FC<UIDesignerProviderProps> = ({
  children,
  initialForm = null,
  onChange,
}) => {
  const [form, setFormState] = useState<UIFormModel | null>(initialForm);
  const [selectedControlId, setSelectedControlId] = useState<string | null>(null);
  const [hoveredControlId, setHoveredControlId] = useState<string | null>(null);
  const [clipboardControl, setClipboardControl] = useState<UIControlModel | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedControlType, setDraggedControlType] = useState<UIControlType | null>(null);
  const [draggedControlId, setDraggedControlId] = useState<string | null>(null);
  const [zoom, setZoomState] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [gridSize, setGridSizeState] = useState(8);

  // Historia
  const historyRef = useRef<HistoryEntry[]>([]);
  const historyIndexRef = useRef(-1);
  const isUndoRedoRef = useRef(false);

  // Zapisz do historii
  const saveToHistory = useCallback((newForm: UIFormModel, description: string) => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }

    // Usuń przyszłość po bieżącym indeksie
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);

    // Dodaj nowy wpis
    historyRef.current.push({ form: JSON.parse(JSON.stringify(newForm)), description });
    historyIndexRef.current = historyRef.current.length - 1;

    // Ogranicz historię do 50 wpisów
    if (historyRef.current.length > 50) {
      historyRef.current = historyRef.current.slice(-50);
      historyIndexRef.current = historyRef.current.length - 1;
    }
  }, []);

  // Aktualizuj formularz z powiadomieniem
  const updateForm = useCallback((newForm: UIFormModel, description: string = 'Update') => {
    saveToHistory(newForm, description);
    setFormState(newForm);
    onChange?.(newForm);
  }, [onChange, saveToHistory]);

  // === FORM ACTIONS ===

  const setForm = useCallback((newForm: UIFormModel | null) => {
    setFormState(newForm);
    setSelectedControlId(null);
    if (newForm) {
      // Reset history
      historyRef.current = [{ form: JSON.parse(JSON.stringify(newForm)), description: 'Initial' }];
      historyIndexRef.current = 0;
    }
  }, []);

  const createNewForm = useCallback((name: string) => {
    const rootControl = createControl('vbox', generateId(), 'root', 'fullRect');
    const newForm = createForm(generateId(), name, rootControl);
    setForm(newForm);
  }, [setForm]);

  const updateFormSettings = useCallback((settings: Partial<UIFormModel['settings']>) => {
    if (!form) return;
    const newForm = {
      ...form,
      settings: { ...form.settings, ...settings },
    };
    updateForm(newForm, 'Update form settings');
  }, [form, updateForm]);

  // === SELECTION ===

  const selectControl = useCallback((controlId: string | null) => {
    setSelectedControlId(controlId);
  }, []);

  const hoverControl = useCallback((controlId: string | null) => {
    setHoveredControlId(controlId);
  }, []);

  // === CONTROL OPERATIONS ===

  const addControl = useCallback((
    parentId: string | null,
    type: UIControlType,
    index?: number
  ): UIControlModel | null => {
    if (!form) return null;

    // Get metadata for this control type
    const meta = CONTROL_METADATA[type];

    // Create control with default offsets from metadata
    const newControl = createControl(
      type,
      generateId(),
      type,
      'topLeft',
      meta?.defaultOffsets
    );

    // Apply default properties from metadata
    if (meta?.defaultProperties) {
      newControl.properties = { ...meta.defaultProperties };
    }

    const newRoot = addControlToParent(form.root, parentId, newControl, index);

    updateForm({ ...form, root: newRoot }, `Add ${type}`);
    setSelectedControlId(newControl.id);

    return newControl;
  }, [form, updateForm]);

  const updateControl = useCallback((controlId: string, updates: Partial<UIControlModel>) => {
    if (!form) return;

    const newRoot = updateControlInTree(form.root, controlId, updates);
    updateForm({ ...form, root: newRoot }, 'Update control');
  }, [form, updateForm]);

  const deleteControl = useCallback((controlId: string) => {
    if (!form) return;
    if (controlId === form.root.id) return; // Nie można usunąć roota

    const newRoot = removeControlFromTree(form.root, controlId);
    if (!newRoot) return;

    updateForm({ ...form, root: newRoot }, 'Delete control');

    if (selectedControlId === controlId) {
      setSelectedControlId(null);
    }
  }, [form, selectedControlId, updateForm]);

  const moveControl = useCallback((
    controlId: string,
    newParentId: string | null,
    index?: number
  ) => {
    if (!form) return;
    if (controlId === form.root.id) return;

    // Nie można przenieść do siebie samego lub do potomka
    const control = findControlById(form.root, controlId);
    if (!control) return;

    if (newParentId) {
      const targetPath = getControlPathInTree(form.root, newParentId);
      if (targetPath?.includes(controlId)) return; // Target jest potomkiem
    }

    const newRoot = moveControlInTree(form.root, controlId, newParentId, index);
    if (!newRoot) return;

    updateForm({ ...form, root: newRoot }, 'Move control');
  }, [form, updateForm]);

  const duplicateControl = useCallback((controlId: string): UIControlModel | null => {
    if (!form) return null;
    if (controlId === form.root.id) return null;

    const control = findControlById(form.root, controlId);
    if (!control) return null;

    const parent = findParentControl(form.root, controlId);
    const parentId = parent?.id || form.root.id;

    const newControl = cloneControlWithNewIds(control);
    const newRoot = addControlToParent(form.root, parentId, newControl);

    updateForm({ ...form, root: newRoot }, 'Duplicate control');
    setSelectedControlId(newControl.id);

    return newControl;
  }, [form, updateForm]);

  // === CLIPBOARD ===

  const copyControl = useCallback((controlId: string) => {
    if (!form) return;
    const control = findControlById(form.root, controlId);
    if (control) {
      setClipboardControl(JSON.parse(JSON.stringify(control)));
    }
  }, [form]);

  const cutControl = useCallback((controlId: string) => {
    if (!form) return;
    if (controlId === form.root.id) return;

    const control = findControlById(form.root, controlId);
    if (control) {
      setClipboardControl(JSON.parse(JSON.stringify(control)));
      deleteControl(controlId);
    }
  }, [form, deleteControl]);

  const pasteControl = useCallback((parentId: string | null): UIControlModel | null => {
    if (!form || !clipboardControl) return null;

    const newControl = cloneControlWithNewIds(clipboardControl);
    const newRoot = addControlToParent(form.root, parentId || form.root.id, newControl);

    updateForm({ ...form, root: newRoot }, 'Paste control');
    setSelectedControlId(newControl.id);

    return newControl;
  }, [form, clipboardControl, updateForm]);

  // === DRAG & DROP ===

  const startDrag = useCallback((controlType: UIControlType | null, controlId?: string) => {
    setIsDragging(true);
    setDraggedControlType(controlType);
    setDraggedControlId(controlId || null);
  }, []);

  const endDrag = useCallback(() => {
    setIsDragging(false);
    setDraggedControlType(null);
    setDraggedControlId(null);
  }, []);

  // === VIEW ===

  const setZoom = useCallback((newZoom: number) => {
    setZoomState(Math.max(0.25, Math.min(2, newZoom)));
  }, []);

  const toggleGrid = useCallback(() => {
    setShowGrid(prev => !prev);
  }, []);

  const toggleSnapToGrid = useCallback(() => {
    setSnapToGrid(prev => !prev);
  }, []);

  const setGridSize = useCallback((size: number) => {
    setGridSizeState(Math.max(4, Math.min(32, size)));
  }, []);

  // === HISTORY ===

  const canUndo = useCallback(() => historyIndexRef.current > 0, []);
  const canRedo = useCallback(() => historyIndexRef.current < historyRef.current.length - 1, []);

  const undo = useCallback(() => {
    if (!canUndo()) return;

    isUndoRedoRef.current = true;
    historyIndexRef.current--;
    const entry = historyRef.current[historyIndexRef.current];
    setFormState(JSON.parse(JSON.stringify(entry.form)));
    onChange?.(entry.form);
  }, [canUndo, onChange]);

  const redo = useCallback(() => {
    if (!canRedo()) return;

    isUndoRedoRef.current = true;
    historyIndexRef.current++;
    const entry = historyRef.current[historyIndexRef.current];
    setFormState(JSON.parse(JSON.stringify(entry.form)));
    onChange?.(entry.form);
  }, [canRedo, onChange]);

  // === HELPERS ===

  const getControlById = useCallback((controlId: string): UIControlModel | null => {
    if (!form) return null;
    return findControlById(form.root, controlId);
  }, [form]);

  const getParentControl = useCallback((controlId: string): UIControlModel | null => {
    if (!form) return null;
    return findParentControl(form.root, controlId);
  }, [form]);

  const getControlPath = useCallback((controlId: string): string[] => {
    if (!form) return [];
    return getControlPathInTree(form.root, controlId) || [];
  }, [form]);

  const value: UIDesignerContextType = {
    // State
    form,
    selectedControlId,
    hoveredControlId,
    clipboardControl,
    isDragging,
    draggedControlType,
    draggedControlId,
    zoom,
    showGrid,
    snapToGrid,
    gridSize,
    // Actions
    setForm,
    createNewForm,
    updateFormSettings,
    selectControl,
    hoverControl,
    addControl,
    updateControl,
    deleteControl,
    moveControl,
    duplicateControl,
    copyControl,
    cutControl,
    pasteControl,
    startDrag,
    endDrag,
    setZoom,
    toggleGrid,
    toggleSnapToGrid,
    setGridSize,
    undo,
    redo,
    canUndo,
    canRedo,
    getControlById,
    getParentControl,
    getControlPath,
  };

  return (
    <UIDesignerContext.Provider value={value}>
      {children}
    </UIDesignerContext.Provider>
  );
};

// Hook
export const useUIDesigner = () => {
  const context = useContext(UIDesignerContext);
  if (!context) {
    throw new Error('useUIDesigner must be used within UIDesignerProvider');
  }
  return context;
};

export default UIDesignerContext;
