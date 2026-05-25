import { test, expect, addPlayer, navigateTo } from './helpers';
import type { Page } from '@playwright/test';

async function expectPlayerInList(page: Page, name: string) {
  await page.getByPlaceholder('Search players...').fill(name);
  await expect(page.getByText(name)).toBeVisible({ timeout: 10000 });
}

test.describe('Player Management', () => {
  test('shows newly added player in list', async ({ page }) => {
    await addPlayer(page, 'E2E Alice', 'female', 4);
    await navigateTo(page, '/players');

    await expectPlayerInList(page, 'E2E Alice');
  });

  test('shows multiple added players in list', async ({ page }) => {
    await addPlayer(page, 'E2E Bob', 'male', 3);
    await addPlayer(page, 'E2E Carol', 'female', 5);
    await addPlayer(page, 'E2E Dave', 'male', 2);

    await navigateTo(page, '/players');

    await expectPlayerInList(page, 'E2E Bob');
    await expectPlayerInList(page, 'E2E Carol');
    await expectPlayerInList(page, 'E2E Dave');
  });
});
