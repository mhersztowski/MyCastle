import * as Blockly from 'blockly';

import { UPythonBoardManager } from './boards/BoardManager';
import { registerAllBlocks } from './blocks';
import { createUPythonGenerator, type UPythonGenerator } from './generator';
import { buildToolbox, type ExtraToolboxCategory } from './toolbox';
import { Order } from './generator/Order';
import { WorkspaceControls } from '../ardublockly2/WorkspaceControls';

export class UPythonBlocklyService {
  private workspace: Blockly.WorkspaceSvg | null = null;
  private generator: UPythonGenerator | null = null;
  private controls: WorkspaceControls | null = null;
  private changeListeners: Array<() => void> = [];
  private extraCategories: ExtraToolboxCategory[] = [];
  private extraLibraries: Array<{ url: string; remoteName: string }> = [];
  readonly boardManager: UPythonBoardManager;

  constructor(initialBoard = 'esp32_generic') {
    this.boardManager = new UPythonBoardManager(initialBoard);
  }

  /** Register Cut / Copy / Paste context menu items (once per session). */
  private static registerClipboardContextMenu(): void {
    const reg = Blockly.ContextMenuRegistry.registry;
    if (reg.getItem('blockCopy')) return; // already registered

    // Copy — block scope
    reg.register({
      id: 'blockCopy',
      displayText: 'Copy',
      scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
      weight: 1.5,
      preconditionFn: (scope) => (scope.block && !scope.block.isShadow()) ? 'enabled' : 'hidden',
      callback: (scope) => { if (scope.block) Blockly.clipboard.copy(scope.block); },
    });

    // Cut — block scope
    reg.register({
      id: 'blockCut',
      displayText: 'Cut',
      scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
      weight: 1.6,
      preconditionFn: (scope) =>
        (scope.block && !scope.block.isShadow() && scope.block.isDeletable()) ? 'enabled' : 'hidden',
      callback: (scope) => {
        if (!scope.block) return;
        Blockly.clipboard.copy(scope.block);
        scope.block.dispose(true);
      },
    });

    // Paste — workspace scope (shown on right-click on empty canvas)
    reg.register({
      id: 'workspacePaste',
      displayText: 'Paste',
      scopeType: Blockly.ContextMenuRegistry.ScopeType.WORKSPACE,
      weight: 0,
      preconditionFn: () => Blockly.clipboard.getLastCopiedData() ? 'enabled' : 'disabled',
      callback: (scope) => {
        const data = Blockly.clipboard.getLastCopiedData();
        if (data && scope.workspace) Blockly.clipboard.paste(data, scope.workspace);
      },
    });
  }

  /** Initialize Blockly workspace. Optionally runs project.js to register custom blocks. */
  async init(container: HTMLElement, projectScript?: string): Promise<void> {
    registerAllBlocks(this.boardManager);
    this.generator = createUPythonGenerator(this.boardManager);

    this.extraCategories = [];
    this.extraLibraries = [];
    if (projectScript) {
      this.runProjectScript(projectScript);
    }

    Blockly.Scrollbar.scrollbarThickness = 13;

    this.workspace = Blockly.inject(container, {
      collapse: true,
      comments: true,
      css: true,
      disable: true,
      grid: { spacing: 20, length: 3, colour: '#ddd', snap: true },
      maxBlocks: Infinity,
      rtl: false,
      scrollbars: true,
      sounds: false,
      toolbox: buildToolbox(new Set(), this.extraCategories),
      trashcan: true,
      zoom: {
        controls: true,
        wheel: false,
        startScale: 1.0,
        maxScale: 2,
        minScale: 0.2,
        scaleSpeed: 1.2,
      },
    });

    UPythonBlocklyService.registerClipboardContextMenu();

    this.controls = new WorkspaceControls(this.workspace);
    const controlsDom = this.controls.createDom();
    this.workspace.getParentSvg().appendChild(controlsDom);
    this.controls.init();

    this.workspace.addChangeListener((event: Blockly.Events.Abstract) => {
      if (
        event.type === Blockly.Events.BLOCK_CHANGE ||
        event.type === Blockly.Events.BLOCK_CREATE ||
        event.type === Blockly.Events.BLOCK_DELETE ||
        event.type === Blockly.Events.BLOCK_MOVE
      ) {
        this.changeListeners.forEach((fn) => fn());
      }
    });
  }

  onWorkspaceChange(listener: () => void): () => void {
    this.changeListeners.push(listener);
    return () => {
      this.changeListeners = this.changeListeners.filter((fn) => fn !== listener);
    };
  }

  dispose(): void {
    this.changeListeners = [];
    this.controls?.dispose();
    this.controls = null;
    if (this.workspace) {
      this.workspace.dispose();
      this.workspace = null;
    }
    this.generator = null;
  }

  get isInitialized(): boolean {
    return this.workspace !== null;
  }

  /** Generate MicroPython code from the current workspace. */
  generateCode(): string {
    if (!this.workspace || !this.generator) return '';
    try {
      return this.generator.workspaceToCode(this.workspace);
    } catch (e) {
      console.error('[UPythonBlockly] Code generation error:', e);
      return `# Code generation error: ${e}\n`;
    }
  }

  serializeToXml(): string {
    if (!this.workspace) return '';
    const xmlDom = Blockly.Xml.workspaceToDom(this.workspace);
    return Blockly.Xml.domToPrettyText(xmlDom);
  }

  loadFromXml(blocksXml: string): boolean {
    if (!this.workspace || !blocksXml) return false;
    try {
      const xmlDom = Blockly.utils.xml.textToDom(blocksXml);
      this.workspace.clear();
      Blockly.Xml.domToWorkspace(xmlDom, this.workspace);
      return true;
    } catch {
      return false;
    }
  }

  clearWorkspace(): void {
    this.workspace?.clear();
  }

  undo(): void {
    this.workspace?.undo(false);
  }

  redo(): void {
    this.workspace?.undo(true);
  }

  changeBoard(boardKey: string): boolean {
    return this.boardManager.changeBoard(boardKey);
  }

  getSelectedBoard(): string {
    return this.boardManager.selectedBoardKey;
  }

  getAvailableBoards(): string[] {
    return this.boardManager.getAvailableBoardKeys();
  }

  resize(): void {
    if (this.workspace) {
      Blockly.svgResize(this.workspace);
    }
  }

  /** Force re-render of all blocks — fixes layout issues in WebView environments
   *  where SVG text measurements (getBBox) may return wrong values on first render.
   *  Uses double-rAF so rendering happens after the browser has actually painted. */
  rerenderBlocks(): void {
    if (!this.workspace) return;
    Blockly.svgResize(this.workspace);
    // Double requestAnimationFrame ensures we run after two paint frames,
    // giving WebView time to complete its layout before Blockly measures text.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!this.workspace) return;
        // Force reflow before measuring
        void this.workspace.getParentSvg().getBoundingClientRect();
        this.workspace.getAllBlocks(false).forEach((block) => {
          try {
            (block as Blockly.BlockSvg).render();
          } catch { /* ignore */ }
        });
      });
    });
  }

  updateToolboxVisibility(hidden: ReadonlySet<string>): void {
    if (!this.workspace) return;
    this.workspace.updateToolbox(buildToolbox(hidden, this.extraCategories));
  }

  /** Returns libraries declared by project.js via addLibrary(). */
  getLibraries(): Array<{ url: string; remoteName: string }> {
    return this.extraLibraries;
  }

  /** Returns toolbox categories declared by project.js via addCategory(). */
  getCategories(): Array<{ name: string; colour: string; blocks: string[] }> {
    return this.extraCategories;
  }

  /**
   * Execute a project.js script with Blockly + generator context.
   * Available variables: `Blockly`, `generator`, `addCategory`, `Order`, `addLibrary`.
   * - `addCategory({ name, colour, blocks })` — adds a toolbox section
   * - `addLibrary({ url, remoteName })` — declares a library to upload to the device
   * - `Order.ATOMIC` etc. — precedence constants for value generators
   */
  private runProjectScript(scriptContent: string): void {
    const addCategory = (cat: ExtraToolboxCategory) => this.extraCategories.push(cat);
    const addLibrary = (lib: { url: string; remoteName: string }) => this.extraLibraries.push(lib);
    try {
      // eslint-disable-next-line no-new-func
      new Function('Blockly', 'generator', 'addCategory', 'Order', 'addLibrary', scriptContent)(
        Blockly, this.generator, addCategory, Order, addLibrary,
      );
    } catch (e) {
      console.error('[UPythonBlockly] project.js error:', e);
    }
  }
}
