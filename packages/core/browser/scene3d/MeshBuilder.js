/**
 * MeshBuilder — akumulator buforów siatki (pozycje / normalne / UV / indeksy).
 *
 * Geometrie używają go w `build()`. Wynik (`MeshData`) to płaskie tablice gotowe
 * do wgrania jako bufory WebGL/Three/itp. — sam builder jest niezależny od
 * jakiejkolwiek biblioteki renderującej.
 *
 * @typedef {{ positions: number[], normals: number[], uvs: number[], indices: number[] }} MeshData
 */
class MeshBuilder {
  constructor() {
    /** @type {number[]} */ this.positions = [];
    /** @type {number[]} */ this.normals = [];
    /** @type {number[]} */ this.uvs = [];
    /** @type {number[]} */ this.indices = [];
  }
  /** @returns {MeshBuilder} */
  static create() { return new MeshBuilder(); }

  /** Liczba dotychczas dodanych wierzchołków. @returns {number} */
  get vertexCount() { return this.positions.length / 3; }

  /**
   * Dodaje wierzchołek i zwraca jego indeks.
   * @returns {number}
   */
  vertex(px, py, pz, nx, ny, nz, u, v) {
    this.positions.push(px, py, pz);
    this.normals.push(nx, ny, nz);
    this.uvs.push(u, v);
    return this.positions.length / 3 - 1;
  }
  /** Trójkąt z trzech indeksów. @returns {MeshBuilder} */
  triangle(a, b, c) { this.indices.push(a, b, c); return this; }
  /** Czworokąt jako dwa trójkąty (a,b,c,d w kolejności CCW). @returns {MeshBuilder} */
  quad(a, b, c, d) { this.indices.push(a, b, d, b, c, d); return this; }

  /** @returns {MeshData} */
  build() { return { positions: this.positions, normals: this.normals, uvs: this.uvs, indices: this.indices }; }

  /** Statystyki siatki. @param {MeshData} md @returns {{ vertices: number, triangles: number }} */
  static counts(md) { return { vertices: md.positions.length / 3, triangles: md.indices.length / 3 }; }
}

export { MeshBuilder };
