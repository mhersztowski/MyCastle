import { test, expect } from '@playwright/test';

// Exercises @mhersztowski/texteditor (MdEditor / TipTap), @mhersztowski/web-client
// (FilesystemService + MqttClient load the file) and @mhersztowski/core (models).
// Requires the fixture drive file Minis/Users/Admin/drive/notatka.md.
test.describe('Markdown editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login/Admin');
    await page.getByLabel(/password/i).fill('Admin23');
    await page.getByRole('button', { name: /login/i }).click();
    await expect(page).toHaveURL(/\/admin\/Admin\/main/);
  });

  test('Drive page loads the file browser', async ({ page }) => {
    await page.goto('/user/Admin/pim/drive');
    // Drive heading + the fixture file listed.
    await expect(page.getByText(/drive/i).first()).toBeVisible();
    await expect(page.getByText('notatka.md')).toBeVisible();
  });

  test('opens a markdown file in the editor and renders content', async ({ page }) => {
    // Deep-link opens the file straight in the right-hand markdown editor.
    await page.goto('/user/Admin/pim/drive?open=notatka.md');
    const editor = page.locator('.ProseMirror');
    await expect(editor).toBeVisible();
    await expect(editor.getByText('Notatka testowa')).toBeVisible();
    await expect(editor.getByText('pierwszy punkt')).toBeVisible();
  });

  test('editor toolbar is present', async ({ page }) => {
    await page.goto('/user/Admin/pim/drive?open=notatka.md');
    await expect(page.locator('.ProseMirror')).toBeVisible();
    // Bold / Link buttons come from the MdEditor toolbar (texteditor package).
    await expect(page.getByRole('button', { name: /bold|pogrubienie/i }).first()).toBeVisible();
  });
});
