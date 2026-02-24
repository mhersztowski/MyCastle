import { test, expect } from '@playwright/test';

test.describe('User Projects', () => {
  test.beforeEach(async ({ page }) => {
    // Login as regular user
    await page.goto('/login/user1');
    await page.getByLabel(/password/i).fill('user123');
    await page.getByRole('button', { name: /login/i }).click();
    await expect(page).toHaveURL(/\/user\/user1\/main/);
  });

  test('navigate to projects page', async ({ page }) => {
    await page.goto('/user/user1/projects');
    await expect(page.getByText(/projects/i)).toBeVisible();
  });

  test('add a project from available defs', async ({ page }) => {
    await page.goto('/user/user1/projects');
    await page.getByRole('button', { name: /add/i }).click();

    // Select a project def
    await page.getByRole('button', { name: /save|add|confirm/i }).click();
  });

  test('admin user can manage projects', async ({ page }) => {
    await page.goto('/login/admin1');
    await page.getByLabel(/password/i).fill('admin123');
    await page.getByRole('button', { name: /login/i }).click();

    await page.goto('/user/admin1/projects');
    await expect(page.getByText(/projects/i)).toBeVisible();
  });
});
