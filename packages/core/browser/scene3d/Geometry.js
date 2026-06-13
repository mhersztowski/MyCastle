import { BoxGeometry } from './BoxGeometry.js';
import { PlaneGeometry } from './PlaneGeometry.js';
import { CircleGeometry } from './CircleGeometry.js';
import { CylinderGeometry } from './CylinderGeometry.js';
import { ConeGeometry } from './ConeGeometry.js';
import { SphereGeometry } from './SphereGeometry.js';
import { TorusGeometry } from './TorusGeometry.js';

/**
 * @typedef {'box'|'plane'|'circle'|'cylinder'|'cone'|'sphere'|'torus'} GeometryType
 * @typedef {import('./MeshBuilder.js').MeshData} MeshData
 */
const REGISTRY = {
  box: BoxGeometry,
  plane: PlaneGeometry,
  circle: CircleGeometry,
  cylinder: CylinderGeometry,
  cone: ConeGeometry,
  sphere: SphereGeometry,
  torus: TorusGeometry,
};

/**
 * Geometry — fasada dispatchująca po typie. Wszystkie metody statyczne, więc
 * edytor podpowiada `Geometry.build('box', { width: 2 })` itp.
 */
class Geometry {
  /** Lista obsługiwanych typów. @returns {GeometryType[]} */
  static types() { return /** @type {GeometryType[]} */ (Object.keys(REGISTRY)); }
  /** Klasa geometrii dla typu. @param {GeometryType} type */
  static get(type) { const G = REGISTRY[type]; if (!G) throw new Error(`Nieznany typ geometrii: ${type}`); return G; }
  /** Domyślne parametry typu. @param {GeometryType} type */
  static defaults(type) { return Geometry.get(type).defaults(); }
  /** Tworzy instancję geometrii. @param {GeometryType} type @param {object} [params] */
  static create(type, params) { const G = Geometry.get(type); return new G(params); }

  /** @param {GeometryType} type @param {object} params @returns {MeshData} */
  static build(type, params) { return Geometry.get(type).build(params); }
  /** @param {GeometryType} type @param {object} params @returns {number} */
  static volume(type, params) { return Geometry.get(type).volume(params); }
  /** @param {GeometryType} type @param {object} params @returns {number} */
  static surfaceArea(type, params) { return Geometry.get(type).surfaceArea(params); }
  /** @param {GeometryType} type @param {object} params */
  static boundingBox(type, params) { return Geometry.get(type).boundingBox(params); }
}

export { Geometry };
