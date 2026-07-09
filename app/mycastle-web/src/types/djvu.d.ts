// Minimalne deklaracje dla biblioteki djvu.js (djvujs-dist — czyste źródła ESM, bez typów).
// Importujemy tylko dekoder (DjVuDocument) i enkoder (IWImageWriter — do generowania
// testowych .djvu i ewentualnej konwersji).

declare module 'djvujs-dist/library/src/DjVuDocument.js' {
  export interface DjVuPage {
    getImageData(rotate?: boolean): ImageData;
    getWidth(): number;
    getHeight(): number;
  }
  export default class DjVuDocument {
    constructor(buffer: ArrayBuffer, options?: Record<string, unknown>);
    getPagesQuantity(): number;
    getPage(number: number): Promise<DjVuPage>;
    getPageUnsafe(number: number): DjVuPage;
    bufferArray?: ArrayBuffer;
    toArrayBuffer?(): ArrayBuffer;
  }
}

declare module 'djvujs-dist/library/src/iw44/IWImageWriter.js' {
  export default class IWImageWriter {
    constructor(slicenumber?: number, delayInit?: number, grayscale?: boolean);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createOnePageDocument(imageData: ImageData): any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createMultiPageDocument(imageArray: ImageData[]): any;
  }
}
