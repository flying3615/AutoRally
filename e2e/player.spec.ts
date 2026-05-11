import { test, expect, addPlayer, navigateTo } from './helpers';

test.describe('Player Management', () => {
  test('shows newly added player in list', async ({ page }) => {
    await addPlayer(page, 'Alice', 'female', 4);
    await navigateTo(page, '/players');
    await page.waitForTimeout(300);

    await expect(page.getByText('Alice')).toBeVisible();
  });

  test('shows multiple added players in list', async ({ page }) => {
    await addPlayer(page, 'Bob', 'male', 3);
    await addPlayer(page, 'Carol', 'female', 5);
    await addPlayer(page, 'Dave', 'male', 2);

    await navigateTo(page, '/players');
    await page.waitForTimeout(300);

    await expect(page.getByText('Bob')).toBeVisible();
    await expect(page.getByText('Carol')).toBeVisible();
    await expect(page.getByText('Dave')).toBeVisible();
  });
});
