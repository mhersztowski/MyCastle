// Stub dla `pngjs/browser`. Biblioteka djvu.js (DjVuPage.js) importuje pngjs WYŁĄCZNIE
// do eksportu strony jako PNG (`getPageImageDataUrl`), którego w PdfView/DjvuView NIE
// używamy — renderujemy przez `getImageData()` → canvas. Ten stub spełnia import bez
// ciągnięcia całego pngjs (Buffer/zlib) do bundla przeglądarki.
export const PNG = {
  sync: {
    write: () => { throw new Error('pngjs PNG export is not supported (stubbed for djvu.js)'); },
  },
};
export default { PNG };
