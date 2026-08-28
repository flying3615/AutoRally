import { describe, expect, it, afterEach, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => 'ipc-handlers-test-app',
    getPath: () => 'ipc-handlers-test-data',
    isPackaged: false,
  },
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  dialog: {},
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    renameSync: vi.fn(),
    writeFileSync: vi.fn(),
    openSync: vi.fn(() => 1),
    fsyncSync: vi.fn(),
    closeSync: vi.fn(),
  },
}));

import { ipcMain } from 'electron';
import { closeDb, run } from '../main/database';
import { registerIpcHandlers } from '../main/ipc';

type Handler = (event: unknown, ...args: any[]) => any;

async function setupHandlers(): Promise<Map<string, Handler>> {
  const handlers = new Map<string, Handler>();
  vi.mocked(ipcMain.handle).mockImplementation((channel: string, fn: any) => { handlers.set(channel, fn); });
  await registerIpcHandlers();
  return handlers;
}

function call(handlers: Map<string, Handler>, channel: string, ...args: any[]) {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`No handler registered for ${channel}`);
  return fn(null, ...args);
}

afterEach(() => {
  closeDb();
  vi.clearAllMocks();
});

describe('tournaments:setScore / tournament:teamMatches:setScore (applyMatchScore)', () => {
  it('scoring a team-tournament rubber reconciles the parent team match', async () => {
    const handlers = await setupHandlers();

    // format: 'round_robin' (not 'mixed') — team-tournament features (teams,
    // team matches) are independent of tournament format; 'mixed' now requires
    // groupCount/advancePerGroup for the individual group-stage feature, which
    // is unrelated to what this test exercises.
    const t = await call(handlers, 'tournaments:create', { name: 'T', date: '2026-01-01', format: 'round_robin' });
    const p1 = await call(handlers, 'players:create', { name: 'A', gender: 'male', level: 3, phone: '' });
    const p2 = await call(handlers, 'players:create', { name: 'B', gender: 'male', level: 3, phone: '' });
    const p3 = await call(handlers, 'players:create', { name: 'C', gender: 'male', level: 3, phone: '' });
    const p4 = await call(handlers, 'players:create', { name: 'D', gender: 'male', level: 3, phone: '' });

    const team1 = await call(handlers, 'tournament:teams:create', t.id, 'Team 1');
    const team2 = await call(handlers, 'tournament:teams:create', t.id, 'Team 2');
    await call(handlers, 'tournament:teams:addPlayer', team1.id, p1.id);
    await call(handlers, 'tournament:teams:addPlayer', team1.id, p3.id);
    await call(handlers, 'tournament:teams:addPlayer', team2.id, p2.id);
    await call(handlers, 'tournament:teams:addPlayer', team2.id, p4.id);

    await call(handlers, 'tournament:teamMatches:generate', t.id, { ms: 1, ws: 0, md: 0, xd: 0, wd: 0 });
    const teamMatches = await call(handlers, 'tournament:teamMatches:list', t.id);
    const games = await call(handlers, 'tournament:teamMatches:listGames', teamMatches[0].id);
    const rubberId = games[0].id;

    // Score via tournaments:setScore (the Bracket-tab path) rather than
    // tournament:teamMatches:setScore (the Live Panel path) — this is
    // exactly the path that silently skipped reconciliation before this fix.
    await call(handlers, 'tournaments:setScore', rubberId, [{ team1: 21, team2: 15 }, { team1: 21, team2: 10 }]);

    const updatedTeamMatch = (await call(handlers, 'tournament:teamMatches:list', t.id))
      .find((tm: any) => tm.id === teamMatches[0].id);
    expect(updatedTeamMatch.status).toBe('completed');
    expect(updatedTeamMatch.team1Wins).toBe(1);
  });

  it('rejects re-scoring a bracket match after the next round has been generated', async () => {
    const handlers = await setupHandlers();
    const t = await call(handlers, 'tournaments:create', { name: 'K', date: '2026-01-01', format: 'knockout' });
    const players = [];
    for (let i = 0; i < 4; i++) players.push(await call(handlers, 'players:create', { name: `P${i}`, gender: 'male', level: 3, phone: '' }));
    for (const p of players) await call(handlers, 'tournaments:register', t.id, p.id);
    await call(handlers, 'tournaments:generateBracket', t.id);

    const detail = await call(handlers, 'tournaments:get', t.id);
    const sfMatches = detail.matches.filter((m: any) => m.round === 'SF');
    await call(handlers, 'tournaments:setScore', sfMatches[0].id, [{ team1: 21, team2: 15 }, { team1: 21, team2: 10 }]);
    await call(handlers, 'tournaments:setScore', sfMatches[1].id, [{ team1: 21, team2: 15 }, { team1: 21, team2: 10 }]);
    await call(handlers, 'tournaments:advanceWinners', t.id, 'SF');

    // applyMatchScore throws synchronously (it isn't declared async), so the
    // rejection surfaces as a thrown error from call(), not a rejected Promise.
    expect(() =>
      call(handlers, 'tournaments:setScore', sfMatches[0].id, [{ team1: 15, team2: 21 }, { team1: 10, team2: 21 }])
    ).toThrow(/later round/i);
  });

  it('rejects re-scoring a group match after the knockout stage has been generated', async () => {
    const handlers = await setupHandlers();
    const t = await call(handlers, 'tournaments:create', { name: 'M', date: '2026-01-01', format: 'mixed', groupCount: 2, advancePerGroup: 1 });
    const players = [];
    for (let i = 0; i < 4; i++) players.push(await call(handlers, 'players:create', { name: `P${i}`, gender: 'male', level: 3, phone: '' }));
    for (const p of players) await call(handlers, 'tournaments:register', t.id, p.id);
    await call(handlers, 'tournaments:generateBracket', t.id);

    const detail = await call(handlers, 'tournaments:get', t.id);
    const groupMatches = detail.matches.filter((m: any) => m.groupId);
    for (const m of groupMatches) {
      await call(handlers, 'tournaments:setScore', m.id, [{ team1: 21, team2: 15 }, { team1: 21, team2: 10 }]);
    }
    await call(handlers, 'tournaments:generateKnockoutFromGroups', t.id);

    expect(() =>
      call(handlers, 'tournaments:setScore', groupMatches[0].id, [{ team1: 15, team2: 21 }, { team1: 10, team2: 21 }])
    ).toThrow(/knockout stage/i);
  });
});

describe('bracket re-score guard ignores team-tournament rubbers sharing a round label', () => {
  it('does not let an R1 team-match rubber pollute the roundMatches count for an R1 individual match', async () => {
    const handlers = await setupHandlers();

    // format: 'round_robin' with 4 players — generateRoundRobinMatches labels
    // rounds 'R1'/'R2'/'R3' (2 matches each), and these individual matches have
    // groupId = null, teamMatchId = null, so matchKind() classifies them as
    // 'bracket' — the same guard branch a knockout Final/SF uses. This is the
    // ONLY realistic way to get a genuine round-LABEL collision with a
    // team-match rubber's 'R1' at small scale: knockoutRoundName() never
    // returns 'R1' or 'R2' (n<=2 always maps to 'F'), and every knockout/mixed
    // round's match count is forced to a power of two by construction (mixed
    // additionally gated by validateGroupTournamentConfig), so a genuine
    // collision on the *computed next round* (nextRoundExists, ipc.ts:942)
    // only arises at R16/R32 bracket scale — covered by symmetry/construction
    // rather than by a small failing-without-fix fixture. This test instead
    // targets the sibling roundMatches query (ipc.ts:936, fixed in an earlier
    // task) via the one collision that IS reachable at small scale, which
    // still exercises the identical `AND teamMatchId IS NULL` clause shape.
    const t = await call(handlers, 'tournaments:create', { name: 'RR', date: '2026-01-01', format: 'round_robin' });
    const players = [];
    for (let i = 0; i < 4; i++) players.push(await call(handlers, 'players:create', { name: `P${i}`, gender: 'male', level: 3, phone: '' }));
    for (const p of players) await call(handlers, 'tournaments:register', t.id, p.id);
    // Generate the individual bracket BEFORE any team matches exist —
    // generateBracket deletes ALL of this tournament's matches (ipc.ts:849),
    // which would wipe out rubbers created first.
    await call(handlers, 'tournaments:generateBracket', t.id);

    let detail = await call(handlers, 'tournaments:get', t.id);
    const r1Matches = detail.matches.filter((m: any) => m.round === 'R1' && !m.groupId && !m.teamMatchId);
    expect(r1Matches).toHaveLength(2);

    // 2 teams round-robin produces exactly 1 round, labeled 'R1' — the exact
    // label tournament:teamMatches:generate assigns for its first round.
    const teamPlayers = [];
    for (let i = 0; i < 4; i++) teamPlayers.push(await call(handlers, 'players:create', { name: `T${i}`, gender: 'male', level: 3, phone: '' }));
    const team1 = await call(handlers, 'tournament:teams:create', t.id, 'Team 1');
    const team2 = await call(handlers, 'tournament:teams:create', t.id, 'Team 2');
    await call(handlers, 'tournament:teams:addPlayer', team1.id, teamPlayers[0].id);
    await call(handlers, 'tournament:teams:addPlayer', team1.id, teamPlayers[1].id);
    await call(handlers, 'tournament:teams:addPlayer', team2.id, teamPlayers[2].id);
    await call(handlers, 'tournament:teams:addPlayer', team2.id, teamPlayers[3].id);
    await call(handlers, 'tournament:teamMatches:generate', t.id, { ms: 1, ws: 0, md: 0, xd: 0, wd: 0 });

    detail = await call(handlers, 'tournaments:get', t.id);
    const r1Rubbers = detail.matches.filter((m: any) => m.teamMatchId && m.round === 'R1');
    expect(r1Rubbers).toHaveLength(1);

    // With the fix: roundMatches('R1') counts only the 2 real individual
    // matches -> knockoutRoundName(2) = 'F' -> no 'F' round exists -> no throw.
    //
    // Without `AND teamMatchId IS NULL` on the roundMatches query, the rubber
    // would inflate the count to 3 -> knockoutRoundName(3) = 'R3' -> and 'R3'
    // DOES already exist (this round-robin's own third round, generated
    // up-front by generateBracket) -> the guard would wrongly throw "a later
    // round has already been generated" for a match that has no real
    // successor round yet.
    expect(() =>
      call(handlers, 'tournaments:setScore', r1Matches[0].id, [{ team1: 21, team2: 15 }, { team1: 21, team2: 10 }])
    ).not.toThrow();

    const updated = (await call(handlers, 'tournaments:get', t.id)).matches.find((m: any) => m.id === r1Matches[0].id);
    expect(updated.status).toBe('completed');
    expect(updated.winner).toBe('team1');
  });
});

describe('tournaments:advanceWinners ignores team-tournament rubbers sharing a round label (Fix A)', () => {
  it('does not let a completed R1 rubber inflate advancement of a knockout bracket relabeled to R1', async () => {
    const handlers = await setupHandlers();
    const t = await call(handlers, 'tournaments:create', { name: 'K', date: '2026-01-01', format: 'knockout' });
    const players = [];
    for (let i = 0; i < 4; i++) players.push(await call(handlers, 'players:create', { name: `P${i}`, gender: 'male', level: 3, phone: '' }));
    for (const p of players) await call(handlers, 'tournaments:register', t.id, p.id);
    await call(handlers, 'tournaments:generateBracket', t.id);

    // A real 4-entrant knockout bracket's first round is labeled 'SF'
    // (knockoutRoundName(4) === 'SF') — knockoutRoundName's R{n} branch only
    // fires for n > 8, so a genuine bracket round is NEVER literally 'R1'.
    // Relabel it directly so it collides with a team-tournament rubber's
    // round label, which IS always 'R1' for a team's first round
    // (ipc.ts:1333, `R${tm.round}` with tm.round starting at 1) — this
    // reproduces the exact collision described in the fix ruling, forced
    // onto the bracket side since it can't arise there naturally at
    // reachable scale (see the sibling round-robin test above for the same
    // caveat on knockoutRoundName's reachable values).
    run("UPDATE tournament_matches SET round = 'R1' WHERE tournamentId = ? AND round = 'SF'", [t.id]);

    let detail = await call(handlers, 'tournaments:get', t.id);
    const r1BracketMatches = detail.matches.filter((m: any) => m.round === 'R1' && !m.groupId && !m.teamMatchId);
    expect(r1BracketMatches).toHaveLength(2);
    for (const m of r1BracketMatches) {
      await call(handlers, 'tournaments:setScore', m.id, [{ team1: 21, team2: 15 }, { team1: 21, team2: 10 }]);
    }

    // Team-tournament rubber sharing the 'R1' label, and completed (not left
    // pending) — this is the scenario the fix ruling specifically calls out:
    // a completed rubber is indistinguishable from a completed bracket match
    // by `groupId IS NULL` alone, so it must be excluded by `teamMatchId`
    // instead, or it gets counted as a real bracket entrant.
    const teamPlayers = [];
    for (let i = 0; i < 4; i++) teamPlayers.push(await call(handlers, 'players:create', { name: `T${i}`, gender: 'male', level: 3, phone: '' }));
    const team1 = await call(handlers, 'tournament:teams:create', t.id, 'Team 1');
    const team2 = await call(handlers, 'tournament:teams:create', t.id, 'Team 2');
    await call(handlers, 'tournament:teams:addPlayer', team1.id, teamPlayers[0].id);
    await call(handlers, 'tournament:teams:addPlayer', team1.id, teamPlayers[1].id);
    await call(handlers, 'tournament:teams:addPlayer', team2.id, teamPlayers[2].id);
    await call(handlers, 'tournament:teams:addPlayer', team2.id, teamPlayers[3].id);
    await call(handlers, 'tournament:teamMatches:generate', t.id, { ms: 1, ws: 0, md: 0, xd: 0, wd: 0 });

    detail = await call(handlers, 'tournaments:get', t.id);
    const r1Rubbers = detail.matches.filter((m: any) => m.teamMatchId && m.round === 'R1');
    expect(r1Rubbers).toHaveLength(1);
    await call(handlers, 'tournaments:setScore', r1Rubbers[0].id, [{ team1: 21, team2: 15 }, { team1: 21, team2: 10 }]);

    // Without `AND teamMatchId IS NULL`, advanceWinners's currentRoundMatches
    // query (ipc.ts:1112) would pull in the completed rubber alongside the 2
    // completed bracket matches: 3 rows, all with a real winner via
    // winningTeam(). buildNextKnockoutMatches would then compute
    // nextTeams.length === 3 -> knockoutRoundName(3) === 'R3' (not a real
    // bracket round for a 4-entrant knockout) -> and build 2 matches for
    // 'R3' (1 real pairing + 1 bye for the odd-one-out), silently mixing the
    // team's rubber winner into the individual bracket's advancement.
    //
    // With the fix, currentRoundMatches contains only the 2 real bracket
    // matches, both completed -> nextTeams.length === 2 ->
    // knockoutRoundName(2) === 'F' -> exactly 1 new pending Final match is
    // created and returned, with no trace of the rubber.
    const newMatches = await call(handlers, 'tournaments:advanceWinners', t.id, 'R1');
    expect(newMatches).toHaveLength(1);
    expect(newMatches[0].round).toBe('F');
    expect(newMatches[0].status).toBe('pending');

    detail = await call(handlers, 'tournaments:get', t.id);
    const finalMatches = detail.matches.filter((m: any) => m.round === 'F');
    expect(finalMatches).toHaveLength(1);
  });
});

describe('tournament:teams:delete', () => {
  it('rejects deleting a team that already has generated matches', async () => {
    const handlers = await setupHandlers();
    const t = await call(handlers, 'tournaments:create', { name: 'T', date: '2026-01-01', format: 'round_robin' });
    const p1 = await call(handlers, 'players:create', { name: 'A', gender: 'male', level: 3, phone: '' });
    const p2 = await call(handlers, 'players:create', { name: 'B', gender: 'male', level: 3, phone: '' });
    const team1 = await call(handlers, 'tournament:teams:create', t.id, 'Team 1');
    const team2 = await call(handlers, 'tournament:teams:create', t.id, 'Team 2');
    await call(handlers, 'tournament:teams:addPlayer', team1.id, p1.id);
    await call(handlers, 'tournament:teams:addPlayer', team2.id, p2.id);
    await call(handlers, 'tournament:teamMatches:generate', t.id, { ms: 1, ws: 0, md: 0, xd: 0, wd: 0 });

    // Synchronous throw from the handler — see note above.
    expect(() => call(handlers, 'tournament:teams:delete', team1.id)).toThrow(/generated matches/i);
  });

  it('allows deleting a team with no generated matches', async () => {
    const handlers = await setupHandlers();
    const t = await call(handlers, 'tournaments:create', { name: 'T', date: '2026-01-01', format: 'round_robin' });
    const team1 = await call(handlers, 'tournament:teams:create', t.id, 'Team 1');
    expect(call(handlers, 'tournament:teams:delete', team1.id)).toBeUndefined();
  });
});

describe('tournaments:standings scoping (I5) and assignCourt guard (I7)', () => {
  it('excludes team-tournament rubbers from tournaments:standings', async () => {
    const handlers = await setupHandlers();
    const t = await call(handlers, 'tournaments:create', { name: 'T', date: '2026-01-01', format: 'round_robin' });
    const p1 = await call(handlers, 'players:create', { name: 'A', gender: 'male', level: 3, phone: '' });
    const p2 = await call(handlers, 'players:create', { name: 'B', gender: 'male', level: 3, phone: '' });
    const p3 = await call(handlers, 'players:create', { name: 'C', gender: 'male', level: 3, phone: '' });
    const p4 = await call(handlers, 'players:create', { name: 'D', gender: 'male', level: 3, phone: '' });
    const team1 = await call(handlers, 'tournament:teams:create', t.id, 'Team 1');
    const team2 = await call(handlers, 'tournament:teams:create', t.id, 'Team 2');
    await call(handlers, 'tournament:teams:addPlayer', team1.id, p1.id);
    await call(handlers, 'tournament:teams:addPlayer', team1.id, p3.id);
    await call(handlers, 'tournament:teams:addPlayer', team2.id, p2.id);
    await call(handlers, 'tournament:teams:addPlayer', team2.id, p4.id);
    await call(handlers, 'tournament:teamMatches:generate', t.id, { ms: 1, ws: 0, md: 0, xd: 0, wd: 0 });
    const teamMatches = await call(handlers, 'tournament:teamMatches:list', t.id);
    const games = await call(handlers, 'tournament:teamMatches:listGames', teamMatches[0].id);
    await call(handlers, 'tournament:teamMatches:setScore', games[0].id, [{ team1: 21, team2: 15 }, { team1: 21, team2: 10 }]);

    const standings = await call(handlers, 'tournaments:standings', t.id);
    expect(standings).toEqual([]);
  });

  it('does not reset a completed match back to in_progress when assigning a court', async () => {
    const handlers = await setupHandlers();
    const t = await call(handlers, 'tournaments:create', { name: 'T', date: '2026-01-01', format: 'round_robin' });
    const p1 = await call(handlers, 'players:create', { name: 'A', gender: 'male', level: 3, phone: '' });
    const p2 = await call(handlers, 'players:create', { name: 'B', gender: 'male', level: 3, phone: '' });
    const p3 = await call(handlers, 'players:create', { name: 'C', gender: 'male', level: 3, phone: '' });
    const p4 = await call(handlers, 'players:create', { name: 'D', gender: 'male', level: 3, phone: '' });
    const team1 = await call(handlers, 'tournament:teams:create', t.id, 'Team 1');
    const team2 = await call(handlers, 'tournament:teams:create', t.id, 'Team 2');
    await call(handlers, 'tournament:teams:addPlayer', team1.id, p1.id);
    await call(handlers, 'tournament:teams:addPlayer', team1.id, p3.id);
    await call(handlers, 'tournament:teams:addPlayer', team2.id, p2.id);
    await call(handlers, 'tournament:teams:addPlayer', team2.id, p4.id);
    // Two MS rubbers (not one) so that scoring only the first leaves the team
    // match at 'in_progress' rather than jumping straight to 'completed' —
    // that is the only state in which assignCourt's separate parent UPDATE
    // (`... WHERE status = 'pending'`) could theoretically do anything, so
    // it is the state this guard actually needs to be tested in.
    await call(handlers, 'tournament:teamMatches:generate', t.id, { ms: 2, ws: 0, md: 0, xd: 0, wd: 0 });
    const teamMatches = await call(handlers, 'tournament:teamMatches:list', t.id);
    const games = await call(handlers, 'tournament:teamMatches:listGames', teamMatches[0].id);
    await call(handlers, 'tournament:teamMatches:setScore', games[0].id, [{ team1: 21, team2: 15 }, { team1: 21, team2: 10 }]);

    const teamMatchAfterScoring = (await call(handlers, 'tournament:teamMatches:list', t.id))
      .find((tm: any) => tm.id === teamMatches[0].id);
    expect(teamMatchAfterScoring.status).toBe('in_progress');

    await call(handlers, 'tournament:teamMatches:assignCourt', games[0].id, 3);

    const updatedGames = await call(handlers, 'tournament:teamMatches:listGames', teamMatches[0].id);
    expect(updatedGames[0].status).toBe('completed');
    // Discriminating check: assignCourt's own UPDATE is gated by
    // `AND status != 'completed'`, so it must not touch courtNumber on an
    // already-completed rubber either. Rubbers are inserted with
    // courtNumber: null and setScore never sets it, so this stays null only
    // if that guard actually held — unlike the status assertion above, this
    // one would fail if the guard were ever removed or reordered.
    expect(updatedGames[0].courtNumber).toBeNull();

    // Guards against a *different*, currently-unreachable risk: assignCourt's
    // separate parent-status UPDATE (`SET status = 'in_progress' WHERE status
    // = 'pending'`) firing after the child no-op above. Note this assertion is
    // a tripwire, not a discriminator of that flip in isolation — the parent
    // is already 'in_progress' before assignCourt runs (from scoring the
    // first of two rubbers), so the UPDATE's WHERE clause can't match
    // (status = 'pending' is false) and the value would read 'in_progress'
    // whether or not the guard fires. It still catches a future change that
    // makes the WHERE clause broader (e.g. dropping the status filter).
    const teamMatchAfterAssignCourt = (await call(handlers, 'tournament:teamMatches:list', t.id))
      .find((tm: any) => tm.id === teamMatches[0].id);
    expect(teamMatchAfterAssignCourt.status).toBe('in_progress');
  });
});
