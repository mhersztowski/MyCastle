import { describe, it, expect, vi } from 'vitest';
import { CameraNode } from './CameraNode';

describe('CameraNode', () => {
  // ─── Defaults ─────────────────────────────────────────────

  it('defaults to fov 75, near 0.1, far 1000', () => {
    const cam = new CameraNode();
    expect(cam.fov).toBe(75);
    expect(cam.near).toBeCloseTo(0.1);
    expect(cam.far).toBe(1000);
    expect(cam.type).toBe('camera');
  });

  // ─── Setters ──────────────────────────────────────────────

  it('setFov updates fov and notifies', () => {
    const cam = new CameraNode();
    const spy = vi.fn();
    cam._onChange = spy;

    cam.setFov(90);
    expect(cam.fov).toBe(90);
    expect(spy).toHaveBeenCalled();
  });

  it('setNear updates near and notifies', () => {
    const cam = new CameraNode();
    const spy = vi.fn();
    cam._onChange = spy;

    cam.setNear(0.01);
    expect(cam.near).toBeCloseTo(0.01);
    expect(spy).toHaveBeenCalled();
  });

  it('setFar updates far and notifies', () => {
    const cam = new CameraNode();
    const spy = vi.fn();
    cam._onChange = spy;

    cam.setFar(5000);
    expect(cam.far).toBe(5000);
    expect(spy).toHaveBeenCalled();
  });

  // ─── setProperty ──────────────────────────────────────────

  it('setProperty handles camera.fov, camera.near, camera.far', () => {
    const cam = new CameraNode();

    expect(cam.setProperty('camera.fov', 60)).toBe(true);
    expect(cam.fov).toBe(60);

    expect(cam.setProperty('camera.near', 0.5)).toBe(true);
    expect(cam.near).toBeCloseTo(0.5);

    expect(cam.setProperty('camera.far', 2000)).toBe(true);
    expect(cam.far).toBe(2000);
  });

  it('setProperty delegates base properties to SceneNode', () => {
    const cam = new CameraNode();
    expect(cam.setProperty('name', 'MainCamera')).toBe(true);
    expect(cam.name).toBe('MainCamera');
  });

  it('setProperty returns false for unknown properties', () => {
    const cam = new CameraNode();
    expect(cam.setProperty('camera.unknown', 42)).toBe(false);
  });

  // ─── Serialization ────────────────────────────────────────

  it('toData includes fov, near, and far', () => {
    const cam = new CameraNode({
      id: 'cam-1',
      fov: 60,
      near: 0.5,
      far: 500,
    });

    const data = cam.toData();
    expect(data.type).toBe('camera');
    expect(data.fov).toBe(60);
    expect(data.near).toBeCloseTo(0.5);
    expect(data.far).toBe(500);
  });
});
