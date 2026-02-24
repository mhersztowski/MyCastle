import { test, expect } from '@playwright/test';

test.describe('User Devices', () => {
  test.beforeEach(async ({ page }) => {
    // Login as regular user
    await page.goto('/login/user1');
    await page.getByLabel(/password/i).fill('user123');
    await page.getByRole('button', { name: /login/i }).click();
    await expect(page).toHaveURL(/\/user\/user1\/main/);
  });

  test('navigate to devices page', async ({ page }) => {
    await page.goto('/user/user1/devices');
    await expect(page.getByText(/devices/i)).toBeVisible();
  });

  test('add a device', async ({ page }) => {
    await page.goto('/user/user1/devices');
    await page.getByRole('button', { name: /add/i }).click();

    // Select a device def from available options
    await page.getByRole('button', { name: /save|add|confirm/i }).click();
  });

  test('admin user can manage devices', async ({ page }) => {
    // Login as admin instead
    await page.goto('/login/admin1');
    await page.getByLabel(/password/i).fill('admin123');
    await page.getByRole('button', { name: /login/i }).click();

    await page.goto('/user/admin1/devices');
    await expect(page.getByText(/devices/i)).toBeVisible();
  });
});
