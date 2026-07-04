import { expect, type Page } from '@playwright/test';

/** Load the cad-app and wait until the mode tab bar is interactive (the app
 *  shell is mounted). Generous timeout tolerates a cold Vite dev transform. */
export async function gotoCad(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('tab', { name: 'CAD', exact: true })).toBeVisible({ timeout: 90_000 });
}

/** Switch to a mode tab (CAD / CAD 3D / Scene 3D / Electronics / Map / …). */
export async function openMode(page: Page, mode: string) {
  await page.getByRole('tab', { name: mode, exact: true }).click();
}
