import * as Blockly from 'blockly';

import { registerAllBlocks } from './blocks';
import { createPygameGenerator, type PygameGenerator, type PygameMode } from './generator';
import { TOOLBOX } from './toolbox';
import { WorkspaceControls } from '../ardublockly2/WorkspaceControls';

export class PygameBlocklyService {
  private workspace: Blockly.WorkspaceSvg | null = null;
  private generator: PygameGenerator | null = null;
  private controls: WorkspaceControls | null = null;
  private changeListeners: Array<() => void> = [];

  private _mode: PygameMode = 'native';

  get mode(): PygameMode {
    return this._mode;
  }

  /** Change output mode. Does not regenerate code automatically. */
  setMode(mode: PygameMode): void {
    this._mode = mode;
    if (this.generator) {
      this.generator.mode_ = mode;
    }
  }

  async init(container: HTMLElement): Promise<void> {
    registerAllBlocks();
    this.generator = createPygameGenerator();
    this.generator.mode_ = this._mode;

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
      toolbox: TOOLBOX,
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

  generateCode(): string {
    if (!this.workspace || !this.generator) return '';
    this.generator.mode_ = this._mode;
    try {
      return this.generator.workspaceToCode(this.workspace);
    } catch (e) {
      console.error('[PygameBlockly] Code generation error:', e);
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

  resize(): void {
    if (this.workspace) {
      Blockly.svgResize(this.workspace);
    }
  }
}
