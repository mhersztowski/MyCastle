import { test, expect } from '@playwright/test';

test.describe('Admin CRUD', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login/admin1');
    await page.getByLabel(/password/i).fill('admin123');
    await page.getByRole('button', { name: /login/i }).click();
    await expect(page).toHaveURL(/\/admin\/admin1\/main/);
  });

  test.describe('Users management', () => {
    test('navigate to users page and see existing users', async ({ page }) => {
      await page.goto('/admin/admin1/users');
      await expect(page.getByText('Admin')).toBeVisible();
      await expect(page.getByText('TestUser')).toBeVisible();
    });

    test('create a new user', async ({ page }) => {
      await page.goto('/admin/admin1/users');
      await page.getByRole('button', { name: /add user/i }).click();

      await page.getByLabel(/^name/i).fill('NewUser');
      await page.getByLabel(/password/i).fill('newpass');
      await page.getByRole('button', { name: /save/i }).click();

      await expect(page.getByText('NewUser')).toBeVisible();
    });

    test('delete a user', async ({ page }) => {
      await page.goto('/admin/admin1/users');
      // Click delete on the last user row
      const rows = page.locator('tbody tr');
      const lastRow = rows.last();
      await lastRow.getByRole('button').filter({ has: page.locator('[data-testid="DeleteIcon"]') }).click();
      await page.getByRole('button', { name: /delete/i }).click();
    });
  });

  test.describe('Device Defs management', () => {
    test('navigate to device defs page', async ({ page }) => {
      await page.goto('/admin/admin1/devicesdefs');
      await expect(page.getByText('Arduino Uno')).toBeVisible();
    });

    test('create a device def', async ({ page }) => {
      await page.goto('/admin/admin1/devicesdefs');
      await page.getByRole('button', { name: /add/i }).click();

      await page.getByLabel(/name/i).fill('ESP32 Board');
      await page.getByRole('button', { name: /save/i }).click();

      await expect(page.getByText('ESP32 Board')).toBeVisible();
    });
  });

  test.describe('Module Defs management', () => {
    test('navigate to module defs page', async ({ page }) => {
      await page.goto('/admin/admin1/modulesdefs');
      await expect(page.getByText('WiFi Module')).toBeVisible();
    });

    test('create a module def', async ({ page }) => {
      await page.goto('/admin/admin1/modulesdefs');
      await page.getByRole('button', { name: /add/i }).click();

      await page.getByLabel(/name/i).fill('Bluetooth Module');
      await page.getByRole('button', { name: /save/i }).click();

      await expect(page.getByText('Bluetooth Module')).toBeVisible();
    });
  });

  test.describe('Project Defs management', () => {
    test('navigate to project defs page', async ({ page }) => {
      await page.goto('/admin/admin1/projectdefs');
      await expect(page.getByText('Blink LED')).toBeVisible();
    });

    test('create a project def', async ({ page }) => {
      await page.goto('/admin/admin1/projectdefs');
      await page.getByRole('button', { name: /add/i }).click();

      await page.getByLabel(/name/i).fill('Sensor Reader');
      await page.getByRole('button', { name: /save/i }).click();

      await expect(page.getByText('Sensor Reader')).toBeVisible();
    });
  });
});
