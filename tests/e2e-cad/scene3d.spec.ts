import { test, expect } from '@playwright/test';
import { gotoCad, openMode } from './helpers';

// Exercises @mhersztowski/ui-components-scene3d (RichEditor 3-pane) and
// @mhersztowski/core-scene3d (SceneGraph / SimpleViewer) via the Scene 3D mode.
test.describe('Scene 3D editor', () => {
  test.beforeEach(async ({ page }) => {
    await gotoCad(page);
    await openMode(page, 'Scene 3D');
  });

  test('mounts the three.js viewport', async ({ page }) => {
    await expect(page.locator('canvas[data-engine]')).toBeAttached();
  });

  test('mounts the RichEditor menubar (File menu)', async ({ page }) => {
    // RichEditor renders a top menu bar with a File menu (ui-components-scene3d).
    await expect(page.getByRole('button', { name: /file|plik/i }).first()).toBeAttached();
  });
});
