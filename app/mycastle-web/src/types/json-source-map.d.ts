declare module 'json-source-map' {
  interface Position {
    line: number;
    column: number;
    pos: number;
  }

  interface Pointer {
    key?: Position;
    keyEnd?: Position;
    value: Position;
    valueEnd: Position;
  }

  interface ParseResult {
    data: unknown;
    pointers: Record<string, Pointer>;
  }

  function parse(json: string): ParseResult;
  function stringify(data: unknown, replacer?: null, space?: number): { json: string; pointers: Record<string, Pointer> };

  export { parse, stringify, ParseResult, Pointer, Position };
  export default { parse, stringify };
}
