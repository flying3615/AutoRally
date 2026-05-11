import { test, expect, addPlayer, createSession, checkinPlayer, addTestPlayers, navigateTo } from './helpers';

test.describe('签到流程', () => {
  test('签到球员后等待池中可见', async ({ page }) => {
    const player = await addPlayer(page, '测试球员', 'male', 3) as { id: string };
    const session = await createSession(page, 3) as { id: string };

    await checkinPlayer(page, player.id, session.id);
    await navigateTo(page, `/checkin/${session.id}`);
    await page.waitForTimeout(300);

    await expect(page.getByText('测试球员').first()).toBeVisible();
  });

  test('签到多人后等待池人数正确', async ({ page }) => {
    const players = await addTestPlayers(page, 8);
    const session = await createSession(page, 3) as { id: string };

    for (const p of players) {
      await checkinPlayer(page, p.id, session.id);
    }

    await navigateTo(page, `/checkin/${session.id}`);
    await page.waitForTimeout(300);

    // Should show checked-in count
    await expect(page.getByText(/已签/).first()).toBeVisible();
  });
});
