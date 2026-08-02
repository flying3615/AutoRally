import { type Page } from '@playwright/test';
import { test, expect, addTestPlayers, createSession, checkinPlayer, navigateTo } from './helpers';

type Gender = 'male' | 'female';

interface StoredGame {
  id: string;
  courtNumber: number;
  status: string;
  gameType: string;
  team1Player1Id: string;
  team1Player2Id: string;
  team2Player1Id: string;
  team2Player2Id: string;
}

interface StoredPlayer {
  id: string;
  gender: Gender;
}

interface StoredAttendance {
  id: string;
  playerId: string;
  paused: number;
}

function gamePlayerIds(game: StoredGame): string[] {
  return [
    game.team1Player1Id,
    game.team1Player2Id,
    game.team2Player1Id,
    game.team2Player2Id,
  ];
}

function expectStoredGameSemantics(game: StoredGame, players: Map<string, StoredPlayer>) {
  const ids = gamePlayerIds(game);
  expect(new Set(ids).size, 'each game must use four distinct players').toBe(4);

  const gamePlayers = ids.map((id) => {
    const player = players.get(id);
    expect(player, `game references unknown player ${id}`).toBeDefined();
    if (!player) throw new Error(`game references unknown player ${id}`);
    return player;
  });
  const genders = gamePlayers.map(player => player.gender);
  const teamGenders = [
    genders.slice(0, 2),
    genders.slice(2, 4),
  ];
  const maleCount = genders.filter(gender => gender === 'male').length;

  switch (game.gameType) {
    case 'mixed':
      expect(maleCount).toBe(2);
      for (const team of teamGenders) {
        expect(team.filter(gender => gender === 'male')).toHaveLength(1);
        expect(team.filter(gender => gender === 'female')).toHaveLength(1);
      }
      break;
    case 'male-double':
      expect(maleCount).toBe(4);
      break;
    case 'female-double':
      expect(maleCount).toBe(0);
      break;
    case 'open-double':
      expect([1, 3]).toContain(maleCount);
      break;
    default:
      throw new Error(`Unknown stored game type: ${game.gameType}`);
  }
}

test.describe('Match Flow', () => {
  async function setupMatch(page: Page, playerCount = 12, courtCount = 4) {
    const players = await addTestPlayers(page, playerCount);
    const session = await createSession(page, courtCount) as { id: string };
    for (const p of players) {
      await checkinPlayer(page, p.id, session.id);
    }
    await navigateTo(page, `/match/${session.id}`);
    await page.waitForTimeout(500);
    return { session, players };
  }

  test('generates court cards with unique numbers', async ({ page }) => {
    const { session } = await setupMatch(page);

    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await page.waitForTimeout(500);

    const courtHeaders = page.getByText('COURT', { exact: true });
    const count = await courtHeaders.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const games = await page.evaluate((sid) => window.api.gamesListBySession(sid), session.id) as any[];
    const courtNumbers = games.map((game: any) => game.courtNumber);
    expect(new Set(courtNumbers).size).toBe(courtNumbers.length);
  });

  test('shows timer after starting round', async ({ page }) => {
    await setupMatch(page);

    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /Skip Wait/ }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText(/\d+:\d{2}/).first()).toBeVisible({ timeout: 5000 });
  });

  test('ends all playing games', async ({ page }) => {
    const { session } = await setupMatch(page);

    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /Skip Wait/ }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText(/\d+:\d{2}/).first()).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: 'End round', exact: true }).click();
    await expect.poll(async () => {
      const games = await page.evaluate((sid) => window.api.gamesListBySession(sid), session.id) as any[];
      return games.filter((game: any) => game.status === 'playing').length;
    }).toBe(0);
  });

  test('shows resume button after pausing all', async ({ page }) => {
    await setupMatch(page);

    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /Skip Wait/ }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText(/\d+:\d{2}/).first()).toBeVisible({ timeout: 5000 });

    await expect(page.getByText('In progress', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Pause all', exact: true }).click();

    await expect(page.getByText('Paused', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resume all', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Resume all', exact: true }).click();

    await expect(page.getByText('In progress', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause all', exact: true })).toBeVisible();
  });

  test('replaces pending games on regenerate', async ({ page }) => {
    const { session } = await setupMatch(page);

    // First generation via UI button
    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await page.waitForTimeout(500);

    const sessionId = session.id;
    const games1 = await page.evaluate((sid) => window.api.gamesListBySession(sid), sessionId) as any[];
    const pending1 = games1.filter((g: any) => g.status === 'pending');
    const pending1Ids = new Set(pending1.map((g: any) => g.id));
    expect(pending1Ids.size).toBeGreaterThan(0);

    // Clear pending games via IPC, then navigate back to force a fresh component mount
    // so the Generate Matches button re-appears in the UI
    for (const g of pending1) {
      await page.evaluate((gid) => window.api.gamesDelete(gid), g.id);
    }
    await navigateTo(page, '/');
    await navigateTo(page, `/match/${sessionId}`);
    await page.waitForTimeout(500);

    // Second generation via the UI button — should create new pending games with new IDs
    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await page.waitForTimeout(500);

    const games2 = await page.evaluate((sid) => window.api.gamesListBySession(sid), sessionId) as any[];
    const pending2 = games2.filter((g: any) => g.status === 'pending');

    expect(pending2.length).toBeGreaterThan(0);
    for (const g of pending2) {
      expect(pending1Ids.has(g.id)).toBe(false);
    }
    const courtNumbers = pending2.map((g: any) => g.courtNumber);
    expect(new Set(courtNumbers).size).toBe(courtNumbers.length);
  });

  test('shows pending countdown controls and skip starts the round', async ({ page }) => {
    const { session } = await setupMatch(page, 16);

    await page.getByRole('button', { name: /Generate Matches/ }).click();

    await expect(page.getByText(/Auto-start in/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Pending')).toBeVisible();

    await page.getByRole('button', { name: /^Pause$/ }).click();
    await expect(page.getByText(/Paused at/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /Resume/ })).toBeVisible();

    await page.getByRole('button', { name: /Skip Wait/ }).click();
    await expect(page.getByText('In progress', { exact: true })).toBeVisible({ timeout: 5000 });

    await expect.poll(async () => {
      const games = await page.evaluate((sid) => window.api.gamesListBySession(sid), session.id) as any[];
      return games.filter((game: any) => game.status === 'playing').length;
    }).toBe(4);
  });

  test('fills four courts when twenty players are waiting', async ({ page }) => {
    const { session } = await setupMatch(page, 20);

    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await expect(page.getByText(/Auto-start in/)).toBeVisible({ timeout: 5000 });

    await expect.poll(async () => {
      const games = await page.evaluate((sid) => window.api.gamesListBySession(sid), session.id) as StoredGame[];
      return games.filter(game => game.status === 'pending').length;
    }).toBe(4);

    const [games, players, attendance] = await page.evaluate(async (sid) => Promise.all([
      window.api.gamesListBySession(sid),
      window.api.playersList(),
      window.api.attendanceListBySession(sid),
    ]), session.id) as [StoredGame[], StoredPlayer[], StoredAttendance[]];
    const pending = games.filter(game => game.status === 'pending');
    const playerById = new Map(players.map(player => [player.id, player]));
    const selectedIds = pending.flatMap(gamePlayerIds);
    const checkedInIds = new Set(attendance.map(record => record.playerId));

    expect(pending).toHaveLength(4);
    expect(new Set(pending.map(game => game.courtNumber)).size).toBe(4);
    for (const game of pending) expectStoredGameSemantics(game, playerById);
    expect(new Set(selectedIds).size).toBe(16);
    for (const playerId of selectedIds) {
      expect(checkedInIds.has(playerId)).toBe(true);
    }
  });

  test('excludes paused and checked-out players from persisted matches', async ({ page }) => {
    const { session, players } = await setupMatch(page, 10, 2);
    const attendance = await page.evaluate(
      (sid) => window.api.attendanceListBySession(sid),
      session.id,
    ) as StoredAttendance[];
    const pausedPlayerId = players[0]!.id;
    const checkedOutPlayerId = players[1]!.id;
    const pausedAttendance = attendance.find(record => record.playerId === pausedPlayerId);
    const checkedOutAttendance = attendance.find(record => record.playerId === checkedOutPlayerId);

    expect(pausedAttendance).toBeDefined();
    expect(checkedOutAttendance).toBeDefined();
    if (!pausedAttendance || !checkedOutAttendance) {
      throw new Error('Expected test players to have attendance records');
    }

    await page.evaluate(async ({ pausedAttendanceId, checkedOutAttendanceId }) => {
      await window.api.attendanceSetPaused(pausedAttendanceId, true);
      await window.api.attendanceRemove(checkedOutAttendanceId);
    }, {
      pausedAttendanceId: pausedAttendance.id,
      checkedOutAttendanceId: checkedOutAttendance.id,
    });
    await navigateTo(page, '/');
    await navigateTo(page, `/match/${session.id}`);

    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await expect.poll(async () => {
      const games = await page.evaluate((sid) => window.api.gamesListBySession(sid), session.id) as StoredGame[];
      return games.filter(game => game.status === 'pending').length;
    }).toBe(2);

    const [games, allPlayers, remainingAttendance] = await page.evaluate(async (sid) => Promise.all([
      window.api.gamesListBySession(sid),
      window.api.playersList(),
      window.api.attendanceListBySession(sid),
    ]), session.id) as [StoredGame[], StoredPlayer[], StoredAttendance[]];
    const pending = games.filter(game => game.status === 'pending');
    const playerById = new Map(allPlayers.map(player => [player.id, player]));
    const eligibleIds = new Set(
      remainingAttendance
        .filter(record => record.paused !== 1)
        .map(record => record.playerId),
    );
    const selectedIds = pending.flatMap(gamePlayerIds);

    expect(eligibleIds.size).toBe(8);
    expect(pending).toHaveLength(2);
    for (const game of pending) expectStoredGameSemantics(game, playerById);
    expect(selectedIds).not.toContain(pausedPlayerId);
    expect(selectedIds).not.toContain(checkedOutPlayerId);
    expect(new Set(selectedIds).size).toBe(8);
    for (const playerId of selectedIds) {
      expect(eligibleIds.has(playerId)).toBe(true);
    }
  });

  test('pre-schedules the next round while a round is live', async ({ page }) => {
    await page.evaluate(
      (d) => window.api.settingsSet('gameDuration', d),
      '0.05'
    );

    const { session } = await setupMatch(page, 12);

    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Skip Wait/ }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText(/\d+:\d{2}/).first()).toBeVisible({ timeout: 5000 });

    await expect(page.getByText('Round ending soon', { exact: false })).toBeVisible({ timeout: 10000 });

    await expect.poll(async () => {
      const games = await page.evaluate((sid) => window.api.gamesListBySession(sid), session.id) as any[];
      return games.some((game: any) => game.status === 'playing')
        && games.some((game: any) => game.status === 'pending');
    }).toBe(true);
    await expect(page.getByText('NEXT UP', { exact: true }).first()).toBeVisible();
  });

  test('replaces player in pending game via API (IPC test)', async ({ page }) => {
    const { players } = await setupMatch(page, 20);

    await page.getByRole('button', { name: /Generate Matches/ }).click();
    await page.waitForTimeout(500);

    const sessionId = ((await page.evaluate(() => window.api.sessionsGetActive())) as any).id;
    const games = await page.evaluate((sid) => window.api.gamesListBySession(sid), sessionId) as any[];
    const pendingGame = games.find((g: any) => g.status === 'pending');
    expect(pendingGame).toBeDefined();

    const allGamePlayerIds = new Set<string>(
      games.flatMap((g: any) => [g.team1Player1Id, g.team1Player2Id, g.team2Player1Id, g.team2Player2Id])
    );
    const poolPlayer = players.find(p => !allGamePlayerIds.has(p.id));
    expect(poolPlayer).toBeDefined();

    await page.evaluate(
      ({ gid, slot, newId }) => window.api.gamesReplacePlayer(gid, slot, newId),
      { gid: pendingGame.id, slot: 'team1Player1Id', newId: poolPlayer!.id }
    );

    const updatedGames = await page.evaluate((sid) => window.api.gamesListBySession(sid), sessionId) as any[];
    const updatedGame = updatedGames.find((g: any) => g.id === pendingGame.id);
    expect(updatedGame.team1Player1Id).toBe(poolPlayer!.id);
  });
});
