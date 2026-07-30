/**
 * Testy fasady Three.js.
 *
 * Sprawdzamy to, co fasada faktycznie wnosi ponad surowe API: konwersje form
 * wejściowych (`[x,y,z]`, `'#fff'`, stopnie), sensowne wartości domyślne oraz
 * skróty, które w Three zajmują kilka linii (dopasowanie kadru, sprzątanie
 * pamięci GPU, kadrowanie obiektu). Renderera i loaderów nie ruszamy — wymagają
 * WebGL i sieci, więc ich miejsce jest w testach przeglądarkowych.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  Three, T3Math, T3Geometry, T3Material, T3Texture, T3Object, T3Mesh,
  T3Light, T3Camera, T3Scene, T3Raycast, T3Animate, T3Curve, T3Helper,
} from './three-api';

describe('Three (dostęp do surowego API)', () => {
  it('udostępnia namespace i wersję', () => {
    expect(Three.raw.Vector3).toBe(THREE.Vector3);
    expect(Number(Three.revision)).toBeGreaterThan(100);
  });
});

describe('T3Math — konwersje form wejściowych', () => {
  it('wektor z tablicy, obiektu, liczby i Vector3', () => {
    expect(T3Math.vec3([1, 2, 3]).toArray()).toEqual([1, 2, 3]);
    expect(T3Math.vec3({ x: 4, y: 5, z: 6 }).toArray()).toEqual([4, 5, 6]);
    expect(T3Math.vec3(new THREE.Vector3(7, 8, 9)).toArray()).toEqual([7, 8, 9]);
    // Jedna liczba = ten sam wymiar we wszystkich osiach (skala jednorodna).
    expect(T3Math.vec3(2).toArray()).toEqual([2, 2, 2]);
    expect(T3Math.vec3(1, 2, 3).toArray()).toEqual([1, 2, 3]);
  });

  it('kolor z hexa tekstowego, liczby i Color — zawsze nowy obiekt', () => {
    expect(T3Math.color('#ff0000').getHex()).toBe(0xff0000);
    expect(T3Math.color(0x00ff00).getHex()).toBe(0x00ff00);
    const source = new THREE.Color(0x0000ff);
    const copy = T3Math.color(source);
    expect(copy.getHex()).toBe(0x0000ff);
    expect(copy).not.toBe(source);   // brak współdzielenia stanu
  });

  it('obroty domyślnie w stopniach, radiany na żądanie', () => {
    expect(T3Math.euler(90, 0, 0).x).toBeCloseTo(Math.PI / 2);
    expect(T3Math.euler(Math.PI, 0, 0, false).x).toBeCloseTo(Math.PI);
  });

  it('operacje wektorowe nie modyfikują argumentów', () => {
    const a = new THREE.Vector3(1, 0, 0);
    const b = new THREE.Vector3(0, 1, 0);
    expect(T3Math.add(a, b).toArray()).toEqual([1, 1, 0]);
    expect(a.toArray()).toEqual([1, 0, 0]);
    expect(T3Math.cross(a, b).toArray()).toEqual([0, 0, 1]);
    expect(T3Math.dot(a, b)).toBe(0);
    expect(T3Math.magnitude([3, 4, 0])).toBe(5);
    expect(T3Math.distance([0, 0, 0], [0, 3, 4])).toBe(5);
  });

  it('kwaternion z osi i kąta w stopniach', () => {
    const q = T3Math.quaternionFromAxis([0, 1, 0], 90);
    const rotated = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    expect(rotated.x).toBeCloseTo(0);
    expect(rotated.z).toBeCloseTo(-1);
  });

  it('pomocniki liczbowe', () => {
    expect(T3Math.clamp(5, 0, 3)).toBe(3);
    expect(T3Math.lerp(0, 10, 0.25)).toBe(2.5);
    expect(T3Math.mapRange(512, 0, 1023, -90, 90)).toBeCloseTo(0, 0);
    expect(T3Math.degToRad(180)).toBeCloseTo(Math.PI);
  });
});

describe('T3Geometry', () => {
  it('tworzy geometrie z sensownymi domyślnymi', () => {
    expect(T3Geometry.box()).toBeInstanceOf(THREE.BoxGeometry);
    expect(T3Geometry.sphere()).toBeInstanceOf(THREE.SphereGeometry);
    expect(T3Geometry.cylinder()).toBeInstanceOf(THREE.CylinderGeometry);
    expect(T3Geometry.icosahedron()).toBeInstanceOf(THREE.IcosahedronGeometry);
  });

  it('geometria z surowych pozycji sama liczy normalne', () => {
    const g = T3Geometry.fromPositions([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(T3Geometry.vertexCount(g)).toBe(3);
    expect(g.getAttribute('normal')).toBeDefined();
  });

  it('center przesuwa geometrię do początku układu', () => {
    const g = T3Geometry.translate(T3Geometry.box(2, 2, 2), [10, 0, 0]);
    expect(T3Geometry.boundingBox(g).getCenter(new THREE.Vector3()).x).toBeCloseTo(10);
    T3Geometry.center(g);
    expect(T3Geometry.boundingBox(g).getCenter(new THREE.Vector3()).x).toBeCloseTo(0);
  });

  it('operacje modyfikujące zwracają tę samą geometrię (łańcuch wywołań)', () => {
    const g = T3Geometry.box();
    expect(T3Geometry.rotate(T3Geometry.scaleGeometry(g, 2), 90)).toBe(g);
  });

  it('linia z punktów ma tyle wierzchołków, ile podano', () => {
    expect(T3Geometry.vertexCount(T3Geometry.fromPoints([[0, 0, 0], [1, 1, 1], [2, 0, 2]]))).toBe(3);
  });
});

describe('T3Material', () => {
  it('opcje wspólne działają w każdym materiale', () => {
    const m = T3Material.standard({ color: '#123456', opacity: 0.5, side: 'double', wireframe: true });
    expect(m.color.getHex()).toBe(0x123456);
    expect(m.opacity).toBe(0.5);
    // Przezroczystość włącza się sama — bez tego `opacity` nie działa i to
    // najczęstsza pułapka w Three.
    expect(m.transparent).toBe(true);
    expect(m.side).toBe(THREE.DoubleSide);
    expect(m.wireframe).toBe(true);
  });

  it('standard ma domyślne metalness/roughness, ale można je nadpisać', () => {
    expect(T3Material.standard().roughness).toBeCloseTo(0.6);
    expect(T3Material.standard({ roughness: 0.1 }).roughness).toBeCloseTo(0.1);
  });

  it('setOpacity ustawia też transparent', () => {
    const m = T3Material.basic();
    T3Material.setOpacity(m, 0.3);
    expect(m.transparent).toBe(true);
    T3Material.setOpacity(m, 1);
    expect(m.transparent).toBe(false);
  });

  it('setColor zmienia kolor w miejscu', () => {
    const m = T3Material.basic({ color: '#000000' });
    expect(T3Material.setColor(m, '#ffffff')).toBe(m);
    expect(m.color.getHex()).toBe(0xffffff);
  });
});

describe('T3Object — transformacje i sprzątanie', () => {
  it('ustawia pozycję, obrót w stopniach i skalę', () => {
    const mesh = T3Mesh.create(T3Geometry.box());
    T3Object.setPosition(mesh, [1, 2, 3]);
    T3Object.setRotation(mesh, 0, 90, 0);
    T3Object.setScale(mesh, 2);
    expect(mesh.position.toArray()).toEqual([1, 2, 3]);
    expect(mesh.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(mesh.scale.toArray()).toEqual([2, 2, 2]);
  });

  it('move i rotate działają przyrostowo', () => {
    const mesh = T3Mesh.create(T3Geometry.box(), T3Material.basic(), { position: [1, 1, 1] });
    T3Object.move(mesh, [1, 0, 0]);
    expect(mesh.position.x).toBe(2);
    T3Object.rotate(mesh, 90);
    T3Object.rotate(mesh, 90);
    expect(mesh.rotation.x).toBeCloseTo(Math.PI);
  });

  it('worldPosition uwzględnia rodzica', () => {
    const child = T3Mesh.create(T3Geometry.box(), T3Material.basic(), { position: [1, 0, 0] });
    const group = T3Object.setPosition(T3Mesh.group(child), [10, 0, 0]);
    group.updateMatrixWorld(true);
    expect(T3Object.worldPosition(child).x).toBeCloseTo(11);
  });

  it('find i findAll przeszukują całe poddrzewo', () => {
    const a = T3Object.setName(T3Mesh.create(T3Geometry.box()), 'kostka');
    const b = T3Object.setName(T3Mesh.create(T3Geometry.sphere()), 'kula');
    const root = T3Mesh.group(T3Mesh.group(a), b);
    expect(T3Object.find(root, 'kostka')).toBe(a);
    expect(T3Object.findAll(root, (o) => o instanceof THREE.Mesh)).toHaveLength(2);
  });

  it('size zwraca wymiary obiektu', () => {
    const mesh = T3Mesh.create(T3Geometry.box(2, 4, 6));
    const size = T3Object.size(mesh);
    expect([size.x, size.y, size.z]).toEqual([2, 4, 6]);
  });

  it('dispose zwalnia geometrie i materiały w poddrzewie', () => {
    const geometry = T3Geometry.box();
    const material = T3Material.basic();
    let geometryDisposed = false;
    let materialDisposed = false;
    geometry.addEventListener('dispose', () => { geometryDisposed = true; });
    material.addEventListener('dispose', () => { materialDisposed = true; });

    T3Object.dispose(T3Mesh.group(T3Mesh.create(geometry, material)));
    expect(geometryDisposed).toBe(true);
    expect(materialDisposed).toBe(true);
  });
});

describe('T3Mesh', () => {
  it('domyślnie dostaje materiał standard i brak cieni', () => {
    const mesh = T3Mesh.create(T3Geometry.box());
    expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(mesh.castShadow).toBe(false);
  });

  it('instanced ustawia transformację wybranej instancji', () => {
    const mesh = T3Mesh.instanced(T3Geometry.box(), T3Material.basic(), 4);
    T3Mesh.setInstance(mesh, 2, [5, 0, 0], 2);
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(2, matrix);
    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    expect(position.x).toBe(5);
    expect(new THREE.Vector3().setFromMatrixScale(matrix).x).toBeCloseTo(2);
  });

  it('line buduje geometrię z punktów', () => {
    const line = T3Mesh.line([[0, 0, 0], [1, 0, 0]]);
    expect(line).toBeInstanceOf(THREE.Line);
    expect(T3Geometry.vertexCount(line.geometry)).toBe(2);
  });
});

describe('T3Light', () => {
  it('tworzy światła z pozycją', () => {
    expect(T3Light.ambient('#fff', 0.4).intensity).toBeCloseTo(0.4);
    expect(T3Light.directional('#fff', 1, [1, 2, 3]).position.toArray()).toEqual([1, 2, 3]);
    expect(T3Light.point().position.toArray()).toEqual([0, 2, 0]);
  });

  it('spot przelicza kąt ze stopni', () => {
    expect(T3Light.spot('#fff', 1, [0, 5, 0], { angleDeg: 45 }).angle).toBeCloseTo(Math.PI / 4);
  });

  it('enableShadows ustawia mapę i zasięg kamery cieni', () => {
    const light = T3Light.enableShadows(T3Light.directional(), 2048, 1, 100);
    expect(light.castShadow).toBe(true);
    expect(light.shadow.mapSize.width).toBe(2048);
    expect((light.shadow.camera as THREE.OrthographicCamera).far).toBe(100);
  });
});

describe('T3Camera', () => {
  it('perspektywa patrzy na wskazany punkt', () => {
    const camera = T3Camera.perspective({ position: [0, 0, 5], lookAt: [0, 0, 0] });
    expect(camera.position.toArray()).toEqual([0, 0, 5]);
    expect(camera.fov).toBe(60);
  });

  it('setAspect przelicza proporcje obu rodzajów kamer', () => {
    const perspective = T3Camera.perspective();
    T3Camera.setAspect(perspective, 800, 400);
    expect(perspective.aspect).toBeCloseTo(2);

    const ortho = T3Camera.orthographic({ size: 5 });
    T3Camera.setAspect(ortho, 800, 400);
    expect(ortho.right).toBeCloseTo(10);
  });

  it('frameObject odsuwa kamerę tak, by obiekt zmieścił się w kadrze', () => {
    const camera = T3Camera.perspective({ position: [0, 0, 1] });
    const big = T3Mesh.create(T3Geometry.box(10, 10, 10));
    T3Camera.frameObject(camera, big);
    // Dla sześcianu 10³ i fov 60° dystans to ~5/tan(30°) ≈ 8.7, z marginesem ~11.
    expect(camera.position.length()).toBeGreaterThan(8);
  });
});

describe('T3Scene', () => {
  it('tło z koloru i mgła', () => {
    const scene = T3Scene.create({ background: '#101018', fog: { color: '#101018', near: 5, far: 50 } });
    expect((scene.background as THREE.Color).getHex()).toBe(0x101018);
    expect((scene.fog as THREE.Fog).far).toBe(50);
  });

  it('add/remove i licznik obiektów', () => {
    const scene = T3Scene.create();
    const a = T3Mesh.create(T3Geometry.box());
    const b = T3Light.ambient();
    T3Scene.add(scene, a, b);
    expect(T3Scene.count(scene)).toBe(2);
    T3Scene.remove(scene, b);
    expect(T3Scene.count(scene)).toBe(1);
  });

  it('clear opróżnia scenę i zwalnia pamięć', () => {
    const scene = T3Scene.create();
    const geometry = T3Geometry.box();
    let disposed = false;
    geometry.addEventListener('dispose', () => { disposed = true; });
    T3Scene.add(scene, T3Mesh.create(geometry));

    T3Scene.clear(scene);
    expect(scene.children).toHaveLength(0);
    expect(disposed).toBe(true);
  });

  it('clear bez dispose zostawia zasoby (gdy obiekty są używane dalej)', () => {
    const scene = T3Scene.create();
    const geometry = T3Geometry.box();
    let disposed = false;
    geometry.addEventListener('dispose', () => { disposed = true; });
    T3Scene.add(scene, T3Mesh.create(geometry));

    T3Scene.clear(scene, false);
    expect(scene.children).toHaveLength(0);
    expect(disposed).toBe(false);
  });
});

describe('T3Raycast', () => {
  it('promień z punktu trafia obiekt na swojej drodze', () => {
    const target = T3Mesh.create(T3Geometry.box(2, 2, 2));
    const hits = T3Raycast.ray([0, 0, 10], [0, 0, -1], [target]);
    expect(T3Raycast.first(hits)).toBe(target);
  });

  it('trafienia liczone są z aktualnej pozycji, bez ręcznego updateMatrixWorld', () => {
    const target = T3Mesh.create(T3Geometry.box(1, 1, 1), T3Material.basic(), { position: [50, 0, 0] });
    const hits = T3Raycast.ray([0, 0, 10], [0, 0, -1], [target]);
    expect(hits).toHaveLength(0);
    expect(T3Raycast.first(hits)).toBeNull();
  });
});

describe('T3Animate', () => {
  it('odtwarza klip i znajduje go po nazwie', () => {
    const object = T3Mesh.create(T3Geometry.box());
    const track = new THREE.VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 0, 5, 0]);
    const clip = new THREE.AnimationClip('podskok', 1, [track]);

    const mixer = T3Animate.mixer(object);
    const action = T3Animate.play(mixer, clip, { speed: 2 });
    expect(action.isRunning()).toBe(true);
    expect(action.timeScale).toBe(2);
    expect(T3Animate.findClip([clip], 'podskok')).toBe(clip);

    // Przy `speed: 2` delta 0.25 s to połowa klipu — delta 0.5 trafiłaby
    // dokładnie w jego koniec i pętla zawinęłaby pozycję do zera.
    T3Animate.update(mixer, 0.25);
    expect(object.position.y).toBeCloseTo(2.5);

    T3Animate.stop(mixer);
    expect(action.isRunning()).toBe(false);
  });

  it('loop: false zatrzymuje na ostatniej klatce', () => {
    const mixer = T3Animate.mixer(T3Mesh.create(T3Geometry.box()));
    const clip = new THREE.AnimationClip('raz', 1, [new THREE.VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 1, 0, 0])]);
    const action = T3Animate.play(mixer, clip, { loop: false });
    expect(action.loop).toBe(THREE.LoopOnce);
    expect(action.clampWhenFinished).toBe(true);
  });
});

describe('T3Curve', () => {
  it('punkt i styczna na krzywej', () => {
    const curve = T3Curve.line([0, 0, 0], [10, 0, 0]);
    expect(T3Curve.pointAt(curve, 0.5).x).toBeCloseTo(5);
    expect(T3Curve.tangentAt(curve, 0.5).x).toBeCloseTo(1);
  });

  it('parametr t jest przycinany do 0…1', () => {
    const curve = T3Curve.line([0, 0, 0], [10, 0, 0]);
    expect(T3Curve.pointAt(curve, 5).x).toBeCloseTo(10);
    expect(T3Curve.pointAt(curve, -3).x).toBeCloseTo(0);
  });

  it('krzywa przez punkty daje żądaną liczbę próbek', () => {
    const curve = T3Curve.catmullRom([[0, 0, 0], [1, 2, 0], [3, 0, 0]]);
    expect(T3Curve.toPoints(curve, 10)).toHaveLength(11);
  });

  it('kształt prostokąta nadaje się do wyciągnięcia', () => {
    const geometry = T3Geometry.extrude(T3Curve.rectShape(2, 1), 3);
    const size = T3Geometry.boundingBox(geometry).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(2);
    expect(size.z).toBeCloseTo(3);
  });
});

describe('T3Texture / T3Helper', () => {
  it('solid tworzy teksturę 1×1 w zadanym kolorze', () => {
    const texture = T3Texture.solid('#ff0000');
    expect(texture.image.width).toBe(1);
    expect(Array.from(texture.image.data as Uint8Array).slice(0, 3)).toEqual([255, 0, 0]);
  });

  it('repeat ustawia kafelkowanie razem z trybem zawijania', () => {
    const texture = T3Texture.repeat(T3Texture.solid('#fff'), 4, 2);
    expect(texture.repeat.toArray()).toEqual([4, 2]);
    expect(texture.wrapS).toBe(THREE.RepeatWrapping);
  });

  it('helpery powstają dla właściwych obiektów', () => {
    expect(T3Helper.axes(2)).toBeInstanceOf(THREE.AxesHelper);
    expect(T3Helper.grid()).toBeInstanceOf(THREE.GridHelper);
    expect(T3Helper.wireframe(T3Geometry.box())).toBeInstanceOf(THREE.LineSegments);
    expect(T3Helper.arrow([0, 1, 0])).toBeInstanceOf(THREE.ArrowHelper);
  });
});
