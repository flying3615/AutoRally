import {
  test, expect,
  addPlayer, addTestPlayers, navigateTo,
} from './helpers';
import type { Page } from '@playwright/test';

// ── Tournament helpers ──

async function createTournament(page: Page, name: string, date: string, format: string = 'round_robin', courtCount: number = 4) {
  return await page.evaluate(
    ({ name, date, format, courtCount }) => window.api.tournamentsCreate({ name, description: '', date, format, courtCount }),
    { name, date, format, courtCount }
  );
}

async function registerPlayer(page: Page, tournamentId: string, player1Id: string, player2Id?: string) {
  return await page.evaluate(
    ({ tid, p1, p2 }) => window.api.tournamentsRegister(tid, p1, p2),
    { tid: tournamentId, p1: player1Id, p2: player2Id }
  );
}

async function getRegistrations(page: Page, tournamentId: string) {
  return await page.evaluate(
    (tid) => window.api.tournamentsRegistrations(tid),
    tournamentId
  );
}

async function generateBracket(page: Page, tournamentId: string) {
  return await page.evaluate(
    (tid) => window.api.tournamentsGenerateBracket(tid),
    tournamentId
  );
}

async function getTournamentDetail(page: Page, id: string) {
  return await page.evaluate(
    (tid) => window.api.tournamentsGet(tid),
    id
  );
}

async function setScore(page: Page, matchId: string, sets: [number, number][]) {
  return await page.evaluate(
    ({ mid, sets }) => window.api.tournamentsSetScore(mid, sets.map(([team1, team2]) => ({ team1, team2 }))),
    { mid: matchId, sets }
  );
}

async function getStandings(page: Page, tournamentId: string) {
  return await page.evaluate(
    (tid) => window.api.tournamentsStandings(tid),
    tournamentId
  );
}

function matchesForRound(detail: any, round: string) {
  return detail.matches.filter((m: any) => m.round === round);
}

// ── Tests ──

test.describe('Tournament Management', () => {
  test('creates tournament and shows in list', async ({ page }) => {
    const t = await createTournament(page, 'Test Cup', '2026-06-01', 'knockout', 4) as any;
    expect(t.id).toBeDefined();
    expect(t.name).toBe('Test Cup');
    expect(t.format).toBe('knockout');
    expect(t.status).toBe('upcoming');

    const list = await page.evaluate(() => window.api.tournamentsList()) as any[];
    expect(list.some((r: any) => r.id === t.id)).toBe(true);
  });

  test('registers individual and pair players', async ({ page }) => {
    const [p1, p2, p3] = await addTestPlayers(page, 3) as { id: string; name: string }[];
    const t = await createTournament(page, 'Reg Test', '2026-06-01', 'round_robin', 2) as any;

    // Individual registration
    await registerPlayer(page, t.id, p1.id);
    // Pair registration
    await registerPlayer(page, t.id, p2.id, p3.id);

    const regs = await getRegistrations(page, t.id) as any[];
    expect(regs.length).toBe(2);
    expect(regs.find((r: any) => r.player1Id === p1.id && r.player2Id === null)).toBeTruthy();
    expect(regs.find((r: any) => r.player1Id === p2.id && r.player2Id === p3.id)).toBeTruthy();
  });
});

test.describe('Knockout Bracket', () => {
  test('generates power-of-2 bracket with byes', async ({ page }) => {
    const players = await addTestPlayers(page, 6) as { id: string; name: string }[];
    const t = await createTournament(page, 'KO Cup', '2026-06-05', 'knockout', 2) as any;

    // Register all 6 individually
    for (const p of players) await registerPlayer(page, t.id, p.id);

    const bracket = await generateBracket(page, t.id) as any[];
    // 6 entries → padded to 8 (2^3), so 4 first-round matches
    expect(bracket.length).toBeGreaterThanOrEqual(4);

    // First half of matches should be byes and the other half should be actual matches
    const detail = await getTournamentDetail(page, t.id) as any;
    expect(detail.rounds[0]).toBe('QF');
    const firstRoundMatches = matchesForRound(detail, detail.rounds[0]);
    expect(firstRoundMatches.length).toBe(4);

    // At least 2 byes (6 players → 2 byes in an 8-entry bracket)
    const byes = firstRoundMatches.filter((m: any) => m.winner);
    expect(byes.length).toBe(2); // by definition, bye has a winner assigned immediately
  });

  test('score entry sets winner and advances to next round', async ({ page }) => {
    const players = await addTestPlayers(page, 4) as { id: string; name: string }[];
    const t = await createTournament(page, 'KO Final', '2026-06-05', 'knockout', 2) as any;

    for (const p of players) await registerPlayer(page, t.id, p.id);
    await generateBracket(page, t.id);

    const detail = await getTournamentDetail(page, t.id) as any;
    expect(detail.rounds[0]).toBe('SF');
    const firstRoundMatches = matchesForRound(detail, detail.rounds[0]);
    expect(firstRoundMatches.length).toBe(2);

    // Score the first match: team1 sweeps 21-15, 21-15
    await setScore(page, firstRoundMatches[0].id, [[21, 15], [21, 15]]);
    // Score the second match: team2 sweeps 19-21, 19-21
    await setScore(page, firstRoundMatches[1].id, [[19, 21], [19, 21]]);

    const detail2 = await getTournamentDetail(page, t.id) as any;
    const firstRoundAfter = matchesForRound(detail2, detail.rounds[0]);
    expect(firstRoundAfter[0].winner).toBe('team1');
    expect(firstRoundAfter[0].team1Score).toBe(2); // sets won
    expect(firstRoundAfter[0].team2Score).toBe(0);
    expect(firstRoundAfter[0].set1Team1Score).toBe(21);
    expect(firstRoundAfter[0].set1Team2Score).toBe(15);
    expect(firstRoundAfter[1].winner).toBe('team2');
    expect(firstRoundAfter[1].team2Score).toBe(2); // sets won
  });

  test('advances winners to final round', async ({ page }) => {
    const players = await addTestPlayers(page, 4) as { id: string; name: string }[];
    const t = await createTournament(page, 'KO Advance', '2026-06-05', 'knockout', 2) as any;

    for (const p of players) await registerPlayer(page, t.id, p.id);
    await generateBracket(page, t.id);

    // Score both R1 matches
    const d1 = await getTournamentDetail(page, t.id) as any;
    const firstRound = d1.rounds[0];
    expect(firstRound).toBe('SF');
    const firstRoundMatches = matchesForRound(d1, firstRound);
    await setScore(page, firstRoundMatches[0].id, [[21, 15], [21, 15]]);
    await setScore(page, firstRoundMatches[1].id, [[21, 19], [21, 19]]);

    // Advance winners from R1 to next round
    const advanced = await page.evaluate(
      ({ tid, round }) => window.api.tournamentsAdvanceWinners(tid, round),
      { tid: t.id, round: firstRound }
    ) as any[];

    expect(advanced.length).toBe(1); // 2 winners pair into 1 match
    expect(advanced[0].round).toBe('F');
  });
});

test.describe('Round-Robin Tournament', () => {
  test('generates correct number of round-robin matches', async ({ page }) => {
    const players = await addTestPlayers(page, 4) as { id: string; name: string }[];
    const t = await createTournament(page, 'RR Cup', '2026-06-10', 'round_robin', 2) as any;

    for (const p of players) await registerPlayer(page, t.id, p.id);
    await generateBracket(page, t.id);

    const detail = await getTournamentDetail(page, t.id) as any;
    // 4 teams → 6 matches (4×3/2)
    expect(detail.matches.length).toBe(6);
    // All matches should be 'pending' initially
    expect(detail.matches.every((m: any) => m.status === 'pending')).toBe(true);
  });

  test('round-robin standings are computed correctly', async ({ page }) => {
    const players = await addTestPlayers(page, 4) as { id: string; name: string }[];
    const t = await createTournament(page, 'RR Standings', '2026-06-10', 'round_robin', 2) as any;

    for (const p of players) await registerPlayer(page, t.id, p.id);
    await generateBracket(page, t.id);

    const detail = await getTournamentDetail(page, t.id) as any;

    // Score all 6 matches — player 1 wins all
    for (const m of detail.matches) {
      // team1 always sweeps 21-15, 21-15
      await setScore(page, m.id, [[21, 15], [21, 15]]);
    }

    const standings = await getStandings(page, t.id) as any[];
    expect(standings.length).toBe(4);

    // Each team played 3 matches (round-robin with 4 teams)
    expect(standings.every((s: any) => s.played === 3)).toBe(true);

    // Sorted by wins descending
    const wins = standings.map((s: any) => s.wins);
    for (let i = 1; i < wins.length; i++) {
      expect(wins[i - 1]).toBeGreaterThanOrEqual(wins[i]);
    }
  });
});

test.describe('Tournament UI', () => {
  test('shows tournament list and navigates to detail', async ({ page }) => {
    const t = await createTournament(page, 'UI Test Cup', '2026-06-15', 'round_robin', 3) as any;
    const players = await addTestPlayers(page, 4) as { id: string; name: string }[];
    for (const p of players) await registerPlayer(page, t.id, p.id);

    await navigateTo(page, '/tournaments');

    // Tournament name should appear in the grid
    await expect(page.getByText('UI Test Cup')).toBeVisible({ timeout: 10000 });

    // Navigate to detail
    await navigateTo(page, `/tournaments/${t.id}`);

    await expect(page.getByText('UI Test Cup')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'registration', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'bracket', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'standings', exact: true })).toBeVisible();
  });

  test('registration tab shows registered players', async ({ page }) => {
    const t = await createTournament(page, 'Reg UI', '2026-06-20', 'round_robin', 2) as any;
    const [p1, p2] = await addTestPlayers(page, 2) as { id: string; name: string }[];
    await registerPlayer(page, t.id, p1.id, p2.id);

    await navigateTo(page, `/tournaments/${t.id}`);
    await expect(page.getByText('Reg UI')).toBeVisible({ timeout: 10000 });

    // Click Registration tab
    await page.getByRole('button', { name: 'registration', exact: true }).click();

    // Both player names should appear
    await expect(page.getByText(p1.name)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(p2.name)).toBeVisible({ timeout: 10000 });
  });
});
