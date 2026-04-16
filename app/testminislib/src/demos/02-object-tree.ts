import { MObject, Signal } from '@mhersztowski/minislib';
import { section, sub, ok, log, tree, cyan } from '../print.js';

// Custom subclasses ────────────────────────────────────────────────────────────

class Node extends MObject {
  readonly childAdded = new Signal<[child: Node]>();

  constructor(name: string, parent?: MObject) {
    super(parent, name);
  }

  override setParent(parent: MObject | null): void {
    super.setParent(parent);
    if (parent instanceof Node) {
      parent.childAdded.emit(this);
    }
  }

  addNode(name: string): Node {
    return new Node(name, this);
  }

  printTree(indent = 0): string[] {
    const prefix = indent === 0 ? '' : '  '.repeat(indent - 1) + '├─ ';
    const line = prefix + cyan(this.objectName);
    return [line, ...this.children.flatMap((c) =>
      c instanceof Node ? c.printTree(indent + 1) : []
    )];
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export function demoObjectTree(): void {
  section('🌳', 'OBJECT TREE');

  sub('Building a hierarchy');
  {
    const root = new Node('app');
    const ui   = root.addNode('ui');
    const ctrl = root.addNode('controller');
    ui.addNode('toolbar');
    ui.addNode('canvas');
    ui.addNode('sidebar');
    ctrl.addNode('iotService');
    ctrl.addNode('mqttClient');

    tree(root.printTree());

    log('root.children.length', root.children.length);
    log('root.root', root.root.objectName);
    ok('Tree built with 3 levels');
  }

  sub('findChild / findChildren');
  {
    const root = new Node('root');
    const a = root.addNode('alpha');
    const b = a.addNode('beta');
    b.addNode('gamma');

    const found = root.findChild('gamma');
    ok(`findChild('gamma') from root: ${cyan(found?.objectName ?? 'null')}`);

    const allNodes = root.findChildren<Node>();
    ok(`findChildren() — all descendants: ${cyan(allNodes.map(n => n.objectName).join(', '))}`);
  }

  sub('Auto-disconnect tracked connections on destroy');
  {
    const bus   = new Signal<[msg: string]>();
    const child = new Node('child');
    const root  = new Node('root');
    child.setParent(root);

    const received: string[] = [];
    child.connect(bus, (msg) => received.push(msg));

    bus.emit('hello');
    ok(`Before destroy: received = ${cyan(JSON.stringify(received))}`);

    root.destroy(); // destroys child too
    bus.emit('world'); // child is gone — connection severed
    ok(`After root.destroy(): received = ${cyan(JSON.stringify(received))}  (world ignored)`);
    log('root.isDestroyed',  root.isDestroyed);
    log('child.isDestroyed', child.isDestroyed);
  }

  sub('destroyed signal');
  {
    const parent = new Node('parent');
    const kid    = new Node('kid', parent);
    const order: string[] = [];

    parent.destroyed.connect(() => order.push('parent'));
    kid.destroyed.connect(() => order.push('kid'));

    parent.destroy();
    ok(`Destroy order (children first): ${cyan(order.join(' → '))}`);
  }

  sub('Reparenting');
  {
    const a = new Node('A');
    const b = new Node('B');
    const child = new Node('child', a);
    log('initial parent', child.parent?.objectName);

    child.setParent(b);
    log('after reparent', child.parent?.objectName);
    ok(`A.children: ${cyan(a.children.map(c => c.objectName).join(', ') || '(empty)')}`);
    ok(`B.children: ${cyan(b.children.map(c => c.objectName).join(', '))}`);

    // cleanup
    a.destroy(); b.destroy();
  }
}
