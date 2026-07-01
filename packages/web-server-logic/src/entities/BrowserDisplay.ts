import { VirtualDisplay } from '@mhersztowski/server-logic/web';

export interface DisplayContent {
  text: string;
  color: string;
  background: string;
}

/**
 * A `virtual-display` device whose actions render into a callback (e.g. a React
 * setState or a DOM update). Mirrors the Python client's display, browser-side.
 */
export class BrowserDisplay extends VirtualDisplay {
  private content: DisplayContent = { text: '', color: '#e0e0e0', background: '#101418' };

  constructor(id: string, private readonly onRender?: (c: DisplayContent) => void, name?: string) {
    super(id, name);
  }

  handle(action: string, params: Record<string, unknown>): unknown {
    switch (action) {
      case 'show_text':
        this.content = {
          text: String(params.text ?? ''),
          color: String(params.color ?? '#e0e0e0'),
          background: String(params.background ?? '#101418'),
        };
        this.onRender?.({ ...this.content });
        return undefined;
      case 'clear':
        this.content = { text: '', color: '#e0e0e0', background: '#101418' };
        this.onRender?.({ ...this.content });
        return undefined;
      case 'get':
        return { content: { ...this.content } };
      default:
        return super.handle(action, params);
    }
  }
}
