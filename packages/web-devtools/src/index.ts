/**
 * @mhersztowski/web-devtools — narzędzia deweloperskie działające w przeglądarce.
 *
 * Pakiet jest parasolem na kilka niezależnych narzędzi; każde mieszka we
 * własnym podkatalogu `src/` i ma własny publiczny barrel:
 *
 *   • `diagrams/` — graficzny edytor diagramów (model + adaptery formatów + edytory).
 *
 * Każde narzędzie da się zaimportować osobno
 * (`@mhersztowski/web-devtools/diagrams`), co pozwala hostowi wciągnąć tylko to,
 * czego używa. Korzeń re-eksportuje API narzędzi dla wygody.
 */
export * from './diagrams';
