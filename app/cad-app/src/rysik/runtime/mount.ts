/**
 * Runtime publikacji: montuje bloki Rysika na stronie wygenerowanej przez
 * Quarto i spina je ze zmiennymi dokumentu.
 *
 * Kluczowe: to jest DOKŁADNIE ten sam kod scen i ten sam parser, których używa
 * edytor. Dwa renderery znaczyłyby, że dokument w edytorze i u czytelnika
 * zaczynają się różnić — a wtedy pół etatu idzie na gonienie różnic.
 */

import { createSceneBlock } from '../blocks/factories';
import { getManifest } from '../blocks/registry';
import { parseBlockBody, parseVars } from '../serialize';
import { resolveProps, varsToScope } from '../props';
import type { ResolvedChild, SceneBlock, SceneProps } from '../blocks/SceneBlock';
import type { DocVar } from '../types';

interface MountedBlock {
  type: string;
  scene: SceneBlock;
  props: Record<string, ReturnType<typeof parseBlockBody>['props'][string]>;
  children: ReturnType<typeof parseBlockBody>['children'];
  last: SceneProps;
}

const mounted: MountedBlock[] = [];
let vars: DocVar[] = [];

function readPayload(host: Element, selector: string): string {
  const script = host.querySelector(selector);
  return script?.textContent ?? '';
}

function syncBlock(entry: MountedBlock): void {
  const manifest = getManifest(entry.type);
  if (!manifest) return;
  const scope = varsToScope(vars);

  const next = resolveProps(manifest.props, entry.props, scope);
  const patch: Partial<SceneProps> = {};
  for (const [key, value] of Object.entries(next)) {
    if (entry.last[key] !== value) patch[key] = value;
  }
  if (Object.keys(patch).length > 0) {
    entry.scene.apply(patch);
    entry.last = next;
  }

  for (const [collection, spec] of Object.entries(manifest.children ?? {})) {
    const items: ResolvedChild[] = (entry.children[collection] ?? []).map(child => ({
      id: child.id,
      kind: spec.kind,
      props: resolveProps(spec.props, child.props, scope),
    }));
    entry.scene.setChildren(collection, items);
  }
}

function mountBlock(host: HTMLElement): void {
  const type = host.dataset.type ?? '';
  const manifest = getManifest(type);
  if (!manifest) {
    host.dataset.error = `Nieznany typ bloku: ${type}`;
    return;
  }

  const body = readPayload(host, 'script[type="application/x-rysik"]');
  const parsed = parseBlockBody(manifest, body);
  const scene = createSceneBlock(type);
  if (!scene) {
    host.dataset.error = `Brak implementacji sceny dla ${type}`;
    return;
  }

  const scope = varsToScope(vars);
  const initial = resolveProps(manifest.props, parsed.props, scope);
  scene.mount(host, initial);

  const entry: MountedBlock = {
    type,
    scene,
    props: parsed.props,
    children: parsed.children,
    last: initial,
  };
  mounted.push(entry);

  for (const [collection, spec] of Object.entries(manifest.children ?? {})) {
    scene.setChildren(collection, (parsed.children[collection] ?? []).map(child => ({
      id: child.id,
      kind: spec.kind,
      props: resolveProps(spec.props, child.props, scope),
    })));
  }

  // Kamera zapisana w bloku jest widokiem początkowym, nie stanem sesji.
  const camera = parsed.extras.find(([key]) => key === 'camera')?.[1];
  if (camera && typeof camera === 'object' && !Array.isArray(camera)) {
    const position = camera.position as number[] | undefined;
    const target = camera.target as number[] | undefined;
    if (Array.isArray(position) && Array.isArray(target)) {
      scene.setCamera({
        position: [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0],
        target: [target[0] ?? 0, target[1] ?? 0, target[2] ?? 0],
        fov: typeof camera.fov === 'number' ? camera.fov : 45,
      });
    }
  }
}

function buildVarsPanel(host: HTMLElement): void {
  const parsed = parseVars(readPayload(host, 'script[type="application/x-rysik-vars"]'));
  vars = [...vars, ...parsed];

  for (const v of parsed) {
    const wrapper = document.createElement('label');
    wrapper.className = 'rysik-var';

    const caption = document.createElement('span');
    caption.textContent = v.label ?? v.name;
    wrapper.appendChild(caption);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(v.min ?? 0);
    input.max = String(v.max ?? 100);
    input.step = String(v.step ?? 0.1);
    input.value = String(v.value);

    const output = document.createElement('output');
    output.textContent = String(v.value);

    input.addEventListener('input', () => {
      const value = Number(input.value);
      output.textContent = String(value);
      const target = vars.find(x => x.name === v.name);
      if (target) target.value = value;
      // Suwak w tekście i pole w panelu sceny to ta sama zmienna.
      for (const entry of mounted) syncBlock(entry);
    });

    wrapper.appendChild(input);
    wrapper.appendChild(output);
    host.appendChild(wrapper);
  }
}

function boot(): void {
  document.querySelectorAll<HTMLElement>('.rysik-vars').forEach(buildVarsPanel);

  const hosts = [...document.querySelectorAll<HTMLElement>('.rysik-mount')];
  if (hosts.length === 0) return;

  // Sceny ważą swoje — montujemy dopiero, gdy blok wjeżdża w kadr.
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        observer.unobserve(e.target);
        mountBlock(e.target as HTMLElement);
      }
    }, { rootMargin: '200px' });
    hosts.forEach(h => observer.observe(h));
  } else {
    hosts.forEach(mountBlock);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

export { boot };
