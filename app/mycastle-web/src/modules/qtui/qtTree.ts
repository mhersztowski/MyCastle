// qtTree — immutable-ish helpers for manipulating a QtUiScene widget tree.
// Mutating ops work on a structuredClone of the root, so callers get a fresh
// tree they can drop into React state.

import type { QtWidgetNode } from './QtUiTypes';

export function findNode(root: QtWidgetNode, id: string): QtWidgetNode | null {
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const hit = findNode(c, id);
    if (hit) return hit;
  }
  return null;
}

export function findParent(root: QtWidgetNode, id: string): QtWidgetNode | null {
  for (const c of root.children ?? []) {
    if (c.id === id) return root;
    const hit = findParent(c, id);
    if (hit) return hit;
  }
  return null;
}

/** True if `maybeAncestor` is `node` or contains it somewhere below. */
export function isAncestor(maybeAncestor: QtWidgetNode, id: string): boolean {
  if (maybeAncestor.id === id) return true;
  return (maybeAncestor.children ?? []).some((c) => isAncestor(c, id));
}

function clone(root: QtWidgetNode): QtWidgetNode {
  return structuredClone(root);
}

export function patchNode(root: QtWidgetNode, id: string, patch: Partial<QtWidgetNode>): QtWidgetNode {
  const next = clone(root);
  const target = findNode(next, id);
  if (target) Object.assign(target, patch);
  return next;
}

/** Remove a node (never the root). Returns a new tree. */
export function removeNode(root: QtWidgetNode, id: string): QtWidgetNode {
  const next = clone(root);
  const parent = findParent(next, id);
  if (parent && parent.children) parent.children = parent.children.filter((c) => c.id !== id);
  return next;
}

/** Insert `child` into `parentId` at `index` (clamped; -1/large = append). */
export function insertChild(root: QtWidgetNode, parentId: string, child: QtWidgetNode, index: number): QtWidgetNode {
  const next = clone(root);
  const parent = findNode(next, parentId);
  if (!parent) return next;
  if (!parent.children) parent.children = [];
  const i = index < 0 || index > parent.children.length ? parent.children.length : index;
  parent.children.splice(i, 0, child);
  return next;
}

/**
 * Move `id` under `newParentId` at `index`. No-op if it would move a container
 * into its own subtree. Returns a new tree.
 */
export function moveNode(root: QtWidgetNode, id: string, newParentId: string, index: number): QtWidgetNode {
  if (id === newParentId) return root;
  const moving = findNode(root, id);
  if (!moving || isAncestor(moving, newParentId)) return root;

  const next = clone(root);
  const node = findNode(next, id);
  const oldParent = findParent(next, id);
  const newParent = findNode(next, newParentId);
  if (!node || !oldParent || !newParent || !oldParent.children) return next;

  // Remove from old parent, remembering the original slot for same-parent moves.
  const fromIdx = oldParent.children.findIndex((c) => c.id === id);
  oldParent.children.splice(fromIdx, 1);

  if (!newParent.children) newParent.children = [];
  let i = index < 0 || index > newParent.children.length ? newParent.children.length : index;
  // Within the same parent, account for the just-removed element shifting indices.
  if (oldParent.id === newParent.id && fromIdx < i) i -= 1;
  newParent.children.splice(i, 0, node);
  return next;
}
