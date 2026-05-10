import { MObject } from './core/MObject';
import { Signal } from './core/Signal';

/**
 * Higher-level scene/tree node built on top of MObject.
 *
 * Over MObject it adds:
 *  - `id` — unique UUID per instance
 *  - Typed parent/children access (only `Node` descendants visible)
 *  - `childAdded` / `childRemoved` / `parentChanged` signals
 *  - `addNode(child)` / `removeNode(child)` semantic API
 *  - `traverse(fn)` — depth-first walk including self
 *  - `findNode(predicate)` / `findById(id)` — typed search
 */
export class Node extends MObject {
  readonly id: string;

  readonly childAdded = new Signal<[child: Node]>();
  readonly childRemoved = new Signal<[child: Node]>();
  readonly parentChanged = new Signal<[parent: Node | null]>();

  constructor(parent?: Node, objectName = '') {
    super(parent, objectName);
    this.id = crypto.randomUUID();
  }

  // ── Typed tree access ────────────────────────────────────────────────────

  /** Parent cast to Node, or null if parent is a plain MObject or absent. */
  get parentNode(): Node | null {
    const p = this.parent;
    return p instanceof Node ? p : null;
  }

  /** Children that are Node instances (excludes plain MObject children). */
  get nodes(): readonly Node[] {
    return this.children.filter((c): c is Node => c instanceof Node);
  }

  // ── Tree mutation ────────────────────────────────────────────────────────

  /**
   * Append `child` to this node.
   * Equivalent to `child.setParent(this)` — preferred for readability.
   */
  addNode(child: Node): void {
    child.setParent(this);
  }

  /**
   * Detach `child` from this node.
   * No-op if `child` is not a direct child.
   */
  removeNode(child: Node): void {
    if (child.parent === this) child.setParent(null);
  }

  /**
   * Override setParent to emit tree-change signals.
   * Passing a non-Node MObject throws — Node trees are typed.
   */
  override setParent(parent: MObject | null): void {
    if (parent !== null && !(parent instanceof Node)) {
      throw new TypeError('Node.setParent: parent must be a Node or null');
    }
    const oldParent = this.parentNode;
    super.setParent(parent);
    const newParent = this.parentNode;
    if (oldParent !== newParent) {
      oldParent?.childRemoved.emit(this);
      newParent?.childAdded.emit(this);
      this.parentChanged.emit(newParent);
    }
  }

  // ── Traversal & search ───────────────────────────────────────────────────

  /** Depth-first traversal — visits this node first, then children recursively. */
  traverse(fn: (node: Node) => void): void {
    fn(this);
    for (const child of this.nodes) {
      child.traverse(fn);
    }
  }

  /** Post-order depth-first traversal — visits children before self. */
  traversePost(fn: (node: Node) => void): void {
    for (const child of this.nodes) {
      child.traversePost(fn);
    }
    fn(this);
  }

  /** Find first descendant matching predicate (depth-first). Does not test self. */
  findNode<T extends Node = Node>(predicate: (n: Node) => boolean): T | null {
    for (const child of this.nodes) {
      if (predicate(child)) return child as T;
      const found = child.findNode<T>(predicate);
      if (found) return found;
    }
    return null;
  }

  /** Find first descendant by id. */
  findById(id: string): Node | null {
    return this.findNode((n) => n.id === id);
  }

  /** Ancestor chain from direct parent up to root. */
  ancestors(): Node[] {
    const result: Node[] = [];
    let cur = this.parentNode;
    while (cur) {
      result.push(cur);
      cur = cur.parentNode;
    }
    return result;
  }

  /** Depth relative to root (root = 0). */
  get depth(): number {
    return this.ancestors().length;
  }

  /** True if `candidate` is an ancestor of this node. */
  isDescendantOf(candidate: Node): boolean {
    return this.ancestors().includes(candidate);
  }
}
