/**
 * Ambient types for @novnc/novnc 1.7.0 — the package ships no TypeScript
 * declarations. Covers the public RFB API we use (see docs/API.md).
 */
declare module '@novnc/novnc' {
  import RFB from '@novnc/novnc/core/rfb.js';
  export default RFB;
}

declare module '@novnc/novnc/core/rfb.js' {
  export interface RFBOptions {
    shared?: boolean;
    credentials?: { username?: string; password?: string; target?: string };
    repeaterID?: string;
    wsProtocols?: string[];
  }

  export default class RFB extends EventTarget {
    constructor(
      target: HTMLElement,
      urlOrChannel: string | WebSocket | RTCDataChannel,
      options?: RFBOptions,
    );

    // Input / view options (settable after construction).
    viewOnly: boolean;
    focusOnClick: boolean;
    clipViewport: boolean;
    dragViewport: boolean;
    scaleViewport: boolean;
    resizeSession: boolean;
    showDotCursor: boolean;
    background: string;
    qualityLevel: number;
    compressionLevel: number;
    readonly clippingViewport: boolean;
    readonly capabilities: Record<string, unknown>;

    // Methods.
    disconnect(): void;
    sendCredentials(credentials: { username?: string; password?: string; target?: string }): void;
    sendKey(keysym: number, code: string | null, down?: boolean): void;
    sendCtrlAltDel(): void;
    focus(options?: FocusOptions): void;
    blur(): void;
    machineShutdown(): void;
    machineReboot(): void;
    machineReset(): void;
    clipboardPasteFrom(text: string): void;
    getImageData(): ImageData;
    toDataURL(type?: string, encoderOptions?: unknown): string;
    toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: unknown): void;
  }
}
