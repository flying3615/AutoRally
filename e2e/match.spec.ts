import { test, expect, addTestPlayers, createSession, checkinPlayer, navigateTo } from './helpers';

test.describe('对战核心流程', () => {
  async function setupMatch(page: any, playerCount = 12) {
    const players = await addTestPlayers(page, playerCount);
    const session = await createSession(page, 3) as { id: string };
    for (const p of players) {
      await checkinPlayer(page, p.id, session.id);
    }
    await navigateTo(page, `/match/${session.id}`);
    await page.waitForTimeout(500);
    return { session, players };
  }

  test('生成对战显示场地卡片且编号不重复', async ({ page }) => {
    await setupMatch(page);

    await page.getByRole('button', { name: /生成对战/ }).click();
    await page.waitForTimeout(500);

    const courtCards = page.getByText(/场地 [123]/);
    const count = await courtCards.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const texts = await courtCards.allTextContents();
    const courtNumbers = texts.map(t => t.match(/场地 (\d+)/)?.[1]).filter(Boolean);
    const unique = new Set(courtNumbers);
    expect(unique.size).toBe(courtNumbers.length);
  });

  test('点击开始本轮后显示计时器', async ({ page }) => {
    await setupMatch(page);

    await page.getByRole('button', { name: /生成对战/ }).click();
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /开始本轮/ }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText(/\d+:\d{2}/).first()).toBeVisible({ timeout: 5000 });
  });

  test('全部结束后计时器消失', async ({ page }) => {
    await setupMatch(page);

    await page.getByRole('button', { name: /生成对战/ }).click();
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /开始本轮/ }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText(/\d+:\d{2}/).first()).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /全部结束/ }).click();
    await page.waitForTimeout(1000);

    const timerBar = page.locator('text=进行中');
    expect(await timerBar.count()).toBe(0);
  });

  test('全部暂停后显示继续按钮', async ({ page }) => {
    await setupMatch(page);

    await page.getByRole('button', { name: /生成对战/ }).click();
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /开始本轮/ }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText(/\d+:\d{2}/).first()).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /全部暂停/ }).click();
    await page.waitForTimeout(300);

    await expect(page.getByRole('button', { name: /全部继续/ })).toBeVisible();

    await page.getByRole('button', { name: /全部继续/ }).click();
    await page.waitForTimeout(300);

    await expect(page.getByRole('button', { name: /全部暂停/ })).toBeVisible();
  });

  test('重新生成替换旧的待开始对战', async ({ page }) => {
    await setupMatch(page);

    await page.getByRole('button', { name: /生成对战/ }).click();
    await page.waitForTimeout(500);

    // Regenerate
    await page.getByRole('button', { name: /重新生成/ }).click();
    await page.waitForTimeout(500);

    const secondGenCourts = await page.getByText(/场地 \d/).allTextContents();
    expect(secondGenCourts.length).toBeGreaterThan(0);

    const courtNumbers = secondGenCourts.map(t => t.match(/场地 (\d+)/)?.[1]).filter(Boolean);
    const unique = new Set(courtNumbers);
    expect(unique.size).toBe(courtNumbers.length);
  });

  test('倒计时预警后自动生成下一轮', async ({ page }) => {
    // Set gameDuration to 0.05 min (3s) so warning triggers after ~2s
    await page.evaluate(
      (d) => window.api.settingsSet('gameDuration', d),
      '0.05'
    );

    const { session } = await setupMatch(page, 12);

    // Generate and start a round
    await page.getByRole('button', { name: /生成对战/ }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /开始本轮/ }).click();
    await page.waitForTimeout(500);

    // Wait for timer to appear
    await expect(page.getByText(/\d+:\d{2}/).first()).toBeVisible({ timeout: 5000 });

    // Wait for warning phase (should happen within ~2s with 3s total duration)
    // During warning, the UI shows "时间预警" and auto-generates next round
    await expect(page.getByText(/时间预警/)).toBeVisible({ timeout: 10000 });

    // After warning, next round pending games should appear (as overlay)
    // The overlay shows pending games for the next round
    await page.waitForTimeout(1000);

    // Verify that next round games were generated — navigate to match panel fresh
    const pendingCourts = await page.getByText(/场地 \d/).allTextContents();
    expect(pendingCourts.length).toBeGreaterThan(0);
  });

  test('拖拽等待池球员替换待开始对战中的球员', async ({ page }) => {
    // Use 16 players: 12 fill 3 courts, 4 remain in waiting pool
    const { players } = await setupMatch(page, 16);

    // Generate games (pending, not started)
    await page.getByRole('button', { name: /生成对战/ }).click();
    await page.waitForTimeout(500);

    // Find a pending game
    const games = await page.evaluate(
      (sid) => window.api.gamesListBySession(sid),
      (await page.evaluate(() => window.api.sessionsGetActive()) as any).id
    ) as any[];
    const pendingGame = games.find((g: any) => g.status === 'pending');
    expect(pendingGame).toBeDefined();

    // Find a player not in any game (in the waiting pool)
    const allGamePlayerIds = new Set<string>();
    for (const g of games) {
      allGamePlayerIds.add(g.team1Player1Id);
      allGamePlayerIds.add(g.team1Player2Id);
      allGamePlayerIds.add(g.team2Player1Id);
      allGamePlayerIds.add(g.team2Player2Id);
    }
    const poolPlayer = players.find(p => !allGamePlayerIds.has(p.id));
    expect(poolPlayer).toBeDefined();

    // Replace a player in the pending game via API
    const oldPlayerId = pendingGame.team1Player1Id;
    await page.evaluate(
      ({ gid, slot, newId }) => window.api.gamesReplacePlayer(gid, slot, newId),
      { gid: pendingGame.id, slot: 'team1Player1Id', newId: poolPlayer!.id }
    );

    // Verify the player was swapped
    const updatedGames = await page.evaluate(
      (sid) => window.api.gamesListBySession(sid),
      (await page.evaluate(() => window.api.sessionsGetActive()) as any).id
    ) as any[];
    const updatedGame = updatedGames.find((g: any) => g.id === pendingGame.id);
    expect(updatedGame.team1Player1Id).toBe(poolPlayer!.id);
    expect(updatedGame.t1p1Name).toBe(poolPlayer!.name);
  });
});
