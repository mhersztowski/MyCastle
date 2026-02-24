/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Blockly from 'blockly';

import { BoardManager } from './boards';
import { registerAllBlocks } from './blocks';
import { createArduinoGenerator, ArduinoGenerator } from './generator';
import { TOOLBOX } from './toolbox';
import { loadExternalConfig, type ExternalConfig } from './ConfigLoader';
import { WorkspaceControls } from './WorkspaceControls';

export class ArduBlocklyService {
  private workspace: Blockly.WorkspaceSvg | null = null;
  private generator: ArduinoGenerator | null = null;
  private controls: WorkspaceControls | null = null;
  private changeListeners: Array<() => void> = [];
  readonly boardManager: BoardManager;

  constructor(initialBoard = 'esp8266_wemos_d1') {
    this.boardManager = new BoardManager(initialBoard);
  }

  /**
   * Initialize Blockly workspace. If readFile is provided, loads external
   * config.js from the data directory first (custom blocks, generators, toolbox).
   */
  async init(
    container: HTMLElement,
    readFile?: (path: string) => Promise<{ content: string }>,
  ): Promise<void> {
    // Register built-in Arduino block definitions
    registerAllBlocks(this.boardManager);

    // Create the code generator with all forBlock handlers
    this.generator = createArduinoGenerator(this.boardManager);

    // Load external config (custom blocks/generators/toolbox) if available
    let externalConfig: ExternalConfig = {};
    if (readFile) {
      externalConfig = await loadExternalConfig(
        readFile,
        this.boardManager,
        this.generator,
      );
    }

    // Build final toolbox: base + external categories
    const toolbox = this.buildToolbox(externalConfig);

    // Reduce scrollbar thickness (default is 15)
    Blockly.Scrollbar.scrollbarThickness = 13;

    this.workspace = Blockly.inject(container, {
      collapse: true,
      comments: true,
      css: true,
      disable: true,
      grid: {
        spacing: 20,
        length: 3,
        colour: '#ddd',
        snap: true,
      },
      maxBlocks: Infinity,
      rtl: false,
      scrollbars: true,
      sounds: false,
      toolbox,
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

    // Add undo/redo/clear buttons to the workspace
    this.controls = new WorkspaceControls(this.workspace);
    const controlsDom = this.controls.createDom();
    this.workspace.getParentSvg().appendChild(controlsDom);
    this.controls.init();

    // Notify listeners on meaningful workspace changes
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

  private buildToolbox(config: ExternalConfig): Blockly.utils.toolbox.ToolboxDefinition {
    if (!config.toolboxCategories?.length) {
      return TOOLBOX;
    }
    // External config replaces the entire toolbox
    return {
      kind: 'categoryToolbox',
      contents: config.toolboxCategories,
    };
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

  generateArduinoCode(): string {
    if (!this.workspace || !this.generator) return '';
    return this.generator.workspaceToCode(this.workspace);
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
    if (this.workspace) {
      this.workspace.clear();
    }
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
}
