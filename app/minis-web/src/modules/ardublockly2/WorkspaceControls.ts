/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Blockly from 'blockly';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BTN_SIZE = 28;
const SPACING = 2;
const MARGIN = 20;

// SVG path data for each button icon (24x24 viewBox scaled to fit)
const ICON_UNDO =
  'M12.5 8c-2.6 0-5 1-6.9 2.6L2 7v9h9l-3.6-3.6c1.4-1.2 3.2-1.9 5.1-1.9 3.5 0 6.5 2.3 7.5 5.5l2.4-.8C21 11.5 17.1 8 12.5 8z';
const ICON_REDO =
  'M18.4 10.6C16.5 9 14.1 8 11.5 8c-4.6 0-8.5 3.5-9.9 8.2l2.4.8c1-3.2 4-5.5 7.5-5.5 1.9 0 3.7.7 5.1 1.9L13 17h9V8l-3.6 2.6z';
const ICON_CLEAR =
  'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z';

interface BtnDef {
  icon: string;
  tooltip: string;
  handler: () => void;
}

/**
 * Custom Blockly workspace controls (undo, redo, clear) rendered as SVG
 * buttons positioned by Blockly's component manager alongside zoom/trashcan.
 */
export class WorkspaceControls implements Blockly.IPositionable {
  readonly id = 'workspaceControls';

  private workspace: Blockly.WorkspaceSvg;
  private svgGroup: SVGGElement | null = null;
  private left = 0;
  private top = 0;
  private initialized = false;
  private btnDefs: BtnDef[];
  private totalHeight: number;

  constructor(workspace: Blockly.WorkspaceSvg) {
    this.workspace = workspace;

    this.btnDefs = [
      { icon: ICON_UNDO, tooltip: 'Undo', handler: () => workspace.undo(false) },
      { icon: ICON_REDO, tooltip: 'Redo', handler: () => workspace.undo(true) },
      { icon: ICON_CLEAR, tooltip: 'Clear', handler: () => workspace.clear() },
    ];

    this.totalHeight = this.btnDefs.length * BTN_SIZE + (this.btnDefs.length - 1) * SPACING;
  }

  createDom(): SVGElement {
    this.svgGroup = document.createElementNS(SVG_NS, 'g');

    this.btnDefs.forEach((def, i) => {
      const y = i * (BTN_SIZE + SPACING);
      const g = this.createButton(def, y);
      this.svgGroup!.appendChild(g);
    });

    return this.svgGroup;
  }

  private createButton(def: BtnDef, y: number): SVGGElement {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('transform', `translate(0, ${y})`);
    g.style.cursor = 'pointer';

    // Background rect
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('width', String(BTN_SIZE));
    rect.setAttribute('height', String(BTN_SIZE));
    rect.setAttribute('rx', '4');
    rect.setAttribute('fill', '#fff');
    rect.setAttribute('stroke', '#ddd');
    rect.setAttribute('stroke-width', '1');
    g.appendChild(rect);

    // Icon path
    const iconG = document.createElementNS(SVG_NS, 'g');
    const pad = 4;
    const scale = (BTN_SIZE - pad * 2) / 24;
    iconG.setAttribute('transform', `translate(${pad}, ${pad}) scale(${scale})`);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', def.icon);
    path.setAttribute('fill', '#666');
    iconG.appendChild(path);
    g.appendChild(iconG);

    // Tooltip via SVG <title>
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = def.tooltip;
    g.appendChild(title);

    // Hover effect
    g.addEventListener('pointerenter', () => {
      rect.setAttribute('fill', '#e8e8e8');
      path.setAttribute('fill', '#333');
    });
    g.addEventListener('pointerleave', () => {
      rect.setAttribute('fill', '#fff');
      path.setAttribute('fill', '#666');
    });

    // Click handler
    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      def.handler();
    });

    return g;
  }

  init(): void {
    this.workspace.getComponentManager().addComponent({
      component: this,
      weight: 4, // after ZOOM_CONTROLS_WEIGHT (3)
      capabilities: [Blockly.ComponentManager.Capability.POSITIONABLE],
    });
    this.initialized = true;
  }

  dispose(): void {
    this.workspace.getComponentManager().removeComponent(this.id);
    if (this.svgGroup?.parentNode) {
      this.svgGroup.parentNode.removeChild(this.svgGroup);
    }
    this.svgGroup = null;
  }

  getBoundingRectangle(): Blockly.utils.Rect | null {
    return new Blockly.utils.Rect(
      this.top,
      this.top + this.totalHeight,
      this.left,
      this.left + BTN_SIZE,
    );
  }

  position(metrics: Blockly.MetricsManager.UiMetrics, savedPositions: Blockly.utils.Rect[]): void {
    if (!this.initialized) return;

    const corner = Blockly.uiPosition.getCornerOppositeToolbox(this.workspace, metrics);
    const startRect = Blockly.uiPosition.getStartPositionRect(
      corner,
      new Blockly.utils.Size(BTN_SIZE, this.totalHeight),
      MARGIN,
      MARGIN,
      metrics,
      this.workspace,
    );

    const bumpDir =
      corner.vertical === Blockly.uiPosition.verticalPosition.TOP
        ? Blockly.uiPosition.bumpDirection.DOWN
        : Blockly.uiPosition.bumpDirection.UP;

    const finalRect = Blockly.uiPosition.bumpPositionRect(
      startRect,
      MARGIN,
      bumpDir,
      savedPositions,
    );

    this.top = finalRect.top;
    this.left = finalRect.left;
    this.svgGroup?.setAttribute('transform', `translate(${this.left}, ${this.top})`);
  }
}
