import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('home page shows user list', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Admin')).toBeVisible();
    await expect(page.getByText('TestUser')).toBeVisible();
  });

  test('clicking user navigates to login', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Admin').click();
    await expect(page).toHaveURL(/\/login\/Admin/);
  });

  test('login with correct password navigates to dashboard', async ({ page }) => {
    await page.goto('/login/Admin');
    await page.getByLabel(/password/i).fill('Admin23');
    await page.getByRole('button', { name: /login/i }).click();
    await expect(page).toHaveURL(/\/admin\/Admin\/main/);
  });

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto('/login/Admin');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /login/i }).click();
    await expect(page.getByText(/invalid|error|wrong/i)).toBeVisible();
  });

  test('non-admin user navigates to user dashboard', async ({ page }) => {
    await page.goto('/login/TestUser');
    await page.getByLabel(/password/i).fill('TestUser23');
    await page.getByRole('button', { name: /login/i }).click();
    await expect(page).toHaveURL(/\/user\/TestUser\/main/);
  });

  test('back button returns to home', async ({ page }) => {
    await page.goto('/login/Admin');
    await page.getByRole('button', { name: /back/i }).click();
    await expect(page).toHaveURL('/');
  });
});
