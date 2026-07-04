import { test, expect } from '@playwright/test';
import { gotoCad, openMode } from './helpers';

// Exercises the cad-app shell + mode switching (App.tsx). Each tab mounts the
// component tree of a different package (Map→core-cad-viewer, Scene 3D→
// core-scene3d/ui-components-scene3d, CAD→core-cad renderer). We assert the
// mode's root element is ATTACHED — in headless the WebGL canvas / map panes are
// 0-sized (cad-app sizes via JS), so "visible" is unreliable; "mounted without
// crashing" is what these smoke tests verify.
test.describe('CAD app shell', () => {
  test('loads with all mode tabs', async ({ page }) => {
    await gotoCad(page);
    for (const label of ['CAD', 'CAD 3D', 'Scene 3D', 'Electronics', 'Map']) {
      await expect(page.getByRole('tab', { name: label, exact: true })).toBeVisible();
    }
  });

  test('CAD mode mounts a drawing canvas', async ({ page }) => {
    await gotoCad(page);
    await openMode(page, 'CAD');
    await expect(page.locator('canvas').first()).toBeAttached();
  });

  test('Map mode mounts a Leaflet map', async ({ page }) => {
    await gotoCad(page);
    await openMode(page, 'Map');
    await expect(page.locator('.leaflet-container').first()).toBeAttached();
    await expect(page.locator('.leaflet-tile-pane').first()).toBeAttached();
  });

  test('Scene 3D mode mounts a WebGL viewport', async ({ page }) => {
    await gotoCad(page);
    await openMode(page, 'Scene 3D');
    await expect(page.locator('canvas[data-engine]')).toBeAttached();
  });

  test('Electronics mode mounts', async ({ page }) => {
    await gotoCad(page);
    await openMode(page, 'Electronics');
    await expect(page.locator('canvas, [class*="ComponentLibrary"], [class*="Breadboard"]').first()).toBeAttached();
  });
});
