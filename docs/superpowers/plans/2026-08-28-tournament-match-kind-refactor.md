# Match-Kind Refactor + Critical Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the three "match kinds" hiding in `tournament_matches` (bracket, group, rubber) a named discriminator, unify the two divergent score-setting IPC handlers into one, fix three data-integrity bugs a full-codebase review found, fold in five related findings, and stand up the first IPC-handler-level test coverage this codebase has ever had.

**Architecture:** A new pure `matchKind()` function in `tournament.ts` replaces ad-hoc `if (row.teamMatchId)`/`if (row.groupId)` checks scattered across `ipc.ts`. The two existing score-setting IPC handlers (`tournaments:setScore`, `tournament:teamMatches:setScore`) become thin wrappers around one shared `applyMatchScore()` function that discriminates on `matchKind()` and reconciles whichever parent record needs it. No schema changes — every fix is a query condition, a sort comparator, or a guard clause.

**Tech Stack:** TypeScript, Electron main process (`sql.js`), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-28-tournament-match-kind-refactor-design.md`

## Global Constraints

- No DB schema changes — every fix in this plan is a query condition, sort comparator, or guard clause change.
- The two existing IPC channel names (`tournaments:setScore`, `tournament:teamMatches:setScore`) do not change — only their implementation, so no renderer/preload call-site changes are needed for that part.
- `generateRoundRobinMatches`'s return type does not change (stays `TournamentMatchRecord[]`) — its two new parameters are optional and default to current behavior, so its one non-grouped caller (`ipc.ts:908`) and the existing test at `tournament.test.ts:39` need zero changes.
- `assignRegistrationsToGroups`'s sort direction does NOT change — only `generateKnockoutMatches`, `pairAdjacentByLevel`, and `pairMixedByLevel` flip to descending.
- New tests use the existing `vi.mock('electron', ...)` + `vi.mock('fs', ...)` pattern from `src/__tests__/databasePersistence.test.ts` — no new `initDb()` parameter or mode.

---

## Task 1: `matchKind()` helper + export `knockoutRoundName`

**Files:**
- Modify: `src/main/tournament.ts` (add near the top-level helpers, after `teamKey` around line 76; change `knockoutRoundName` at line 57 to `export`)
- Test: `src/__tests__/tournament.test.ts`

**Interfaces:**
- Produces: `export type MatchKind = 'rubber' | 'group' | 'bracket'`, `export function matchKind(row: { teamMatchId: string | null; groupId: string | null }): MatchKind`, and `knockoutRoundName` becomes exported (signature unchanged: `(entrantCount: number) => string`).

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/tournament.test.ts`, in a new `describe('matchKind', ...)` block placed after the existing `describe('validateGroupTournamentConfig', ...)` block:

```ts
describe('matchKind', () => {
  it('classifies a rubber (teamMatchId set) ahead of a group match', () => {
    expect(matchKind({ teamMatchId: 'tm1', groupId: 'g1' })).toBe('rubber');
    expect(matchKind({ teamMatchId: 'tm1', groupId: null })).toBe('rubber');
  });

  it('classifies a group match when only groupId is set', () => {
    expect(matchKind({ teamMatchId: null, groupId: 'g1' })).toBe('group');
  });

  it('classifies a bracket match when neither is set', () => {
    expect(matchKind({ teamMatchId: null, groupId: null })).toBe('bracket');
  });
});
```

Add `matchKind` to the existing `import { ... } from '../main/tournament';` block at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/tournament.test.ts -t "matchKind"`
Expected: FAIL — `matchKind` is not exported / does not exist.

- [ ] **Step 3: Implement**

In `src/main/tournament.ts`, add after `teamKey` (currently ending around line 76):

```ts
export type MatchKind = 'rubber' | 'group' | 'bracket';

export function matchKind(row: { teamMatchId: string | null; groupId: string | null }): MatchKind {
  if (row.teamMatchId) return 'rubber';
  if (row.groupId) return 'group';
  return 'bracket';
}
```

Change the `knockoutRoundName` declaration (currently `function knockoutRoundName(entrantCount: number): string {`, around line 57) to `export function knockoutRoundName(entrantCount: number): string {`. Do not change its body.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/tournament.test.ts -t "matchKind"`
Expected: PASS

- [ ] **Step 5: Run the full existing suite to confirm exporting `knockoutRoundName` didn't break anything**

Run: `npx vitest run src/__tests__`
Expected: all existing tests still pass (exporting a previously-private function cannot change its behavior).

- [ ] **Step 6: Commit**

```bash
git add src/main/tournament.ts src/__tests__/tournament.test.ts
git commit -m "feat: add matchKind() discriminator, export knockoutRoundName"
```

---

## Task 2: Unify score-setting into `applyMatchScore()` with a re-score guard

**Files:**
- Modify: `src/main/ipc.ts` (replace the bodies of `tournaments:setScore`, currently at line 914, and `tournament:teamMatches:setScore`, currently at line 1364)
- Test: `src/__tests__/tournament.test.ts` is not the right place for this (it's IPC-layer logic) — covered by Task 8's new IPC test harness instead. This task itself has no new unit test of its own; verify with typecheck + the existing suite, then Task 8 adds the regression coverage.

**Interfaces:**
- Consumes: `matchKind`, `knockoutRoundName` (Task 1).
- Produces: an internal (non-exported, module-private to `ipc.ts`) function `applyMatchScore(matchId: string, sets: SetScore[]): { winner: 'team1' | 'team2' }`, used by both existing IPC handlers.

- [ ] **Step 1: Add the shared `applyMatchScore` function**

In `src/main/ipc.ts`, add this function near the two handlers it replaces (place it just before the `ipcMain.handle('tournaments:setScore', ...)` line, currently at line 914):

```ts
function applyMatchScore(matchId: string, sets: SetScore[]): { winner: 'team1' | 'team2' } {
  const match = queryOne<TournamentMatchRecord & { teamMatchId: string | null; groupId: string | null }>(
    'SELECT * FROM tournament_matches WHERE id = ?', [matchId]
  );
  if (!match) throw new Error('Match not found');

  const kind = matchKind(match);

  if (kind === 'bracket') {
    // A naive "any other round exists" check would also match an EARLIER
    // round (e.g. editing the Final's own score would see the SF round and
    // false-block). Compute the round that would immediately follow this
    // one, the same way buildNextKnockoutMatches does, and only block if
    // THAT round already exists.
    const roundMatches = queryAll<{ id: string }>(
      'SELECT id FROM tournament_matches WHERE tournamentId = ? AND groupId IS NULL AND round = ?',
      [match.tournamentId, match.round]
    );
    const nextRound = knockoutRoundName(roundMatches.length);
    if (nextRound !== match.round) {
      const nextRoundExists = queryOne<{ id: string }>(
        'SELECT id FROM tournament_matches WHERE tournamentId = ? AND groupId IS NULL AND round = ? LIMIT 1',
        [match.tournamentId, nextRound]
      );
      if (nextRoundExists) throw new Error('Cannot edit this score — a later round has already been generated');
    }
  }
  if (kind === 'group') {
    const knockoutExists = queryOne<{ id: string }>(
      'SELECT id FROM tournament_matches WHERE tournamentId = ? AND groupId IS NULL LIMIT 1',
      [match.tournamentId]
    );
    if (knockoutExists) throw new Error('Cannot edit this score — the knockout stage has already been generated');
  }

  const { team1Score, team2Score, winner } = computeMatchOutcome(sets);
  const [set1, set2, set3] = sets;

  return transaction(() => {
    run(
      `UPDATE tournament_matches SET
         team1Score = ?, team2Score = ?, winner = ?, status = 'completed', completedAt = ?,
         set1Team1Score = ?, set1Team2Score = ?, set2Team1Score = ?, set2Team2Score = ?, set3Team1Score = ?, set3Team2Score = ?
       WHERE id = ?`,
      [
        team1Score, team2Score, winner, new Date().toISOString(),
        set1!.team1, set1!.team2, set2!.team1, set2!.team2, set3?.team1 ?? null, set3?.team2 ?? null,
        matchId,
      ],
    );

    if (kind === 'rubber') {
      const games = queryAll<{ winner: string | null; status: string }>(
        'SELECT winner, status FROM tournament_matches WHERE teamMatchId = ?', [match.teamMatchId]
      );
      const t1Wins = games.filter(g => g.winner === 'team1').length;
      const t2Wins = games.filter(g => g.winner === 'team2').length;
      const allDone = games.every(g => g.status === 'completed');
      run(
        'UPDATE tournament_team_matches SET team1Wins = ?, team2Wins = ?, status = ? WHERE id = ?',
        [t1Wins, t2Wins, allDone ? 'completed' : 'in_progress', match.teamMatchId]
      );
    }

    return { winner };
  });
}
```

- [ ] **Step 2: Replace the two existing handlers to call it**

Replace the body of `ipcMain.handle('tournaments:setScore', ...)` (currently lines 914-929):

```ts
ipcMain.handle('tournaments:setScore', (_e, matchId: string, sets: SetScore[]) => applyMatchScore(matchId, sets));
```

Replace the body of `ipcMain.handle('tournament:teamMatches:setScore', ...)` (currently lines 1364-1398):

```ts
ipcMain.handle('tournament:teamMatches:setScore', (_e, gameId: string, sets: SetScore[]) => applyMatchScore(gameId, sets));
```

- [ ] **Step 3: Add the import**

In `src/main/ipc.ts`, add `matchKind` and `knockoutRoundName` to the existing `import { ... } from './tournament';` block.

- [ ] **Step 4: Typecheck**

Run: `rtk proxy npx tsc -p tsconfig.node.json --noEmit` (use `rtk proxy`, not the bare command — this environment's `rtk` shell hook has been observed to print "No errors found" while masking a real error under a nonzero exit code; `rtk proxy` bypasses that).
Expected: exit 0, no errors.

- [ ] **Step 5: Run the full existing suite**

Run: `npx vitest run src/__tests__`
Expected: all existing tests pass (this task changes IPC-layer code with no existing unit test coverage of its own, so this run should be a no-op confirmation; Task 8 adds the real regression tests for this function).

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc.ts
git commit -m "fix: unify score-setting into one match-kind-aware handler with a re-score guard"
```

---

## Task 3: Team-delete foreign-key check + frontend error handling

**Files:**
- Modify: `src/main/ipc.ts` (`tournament:teams:delete`, currently lines 1158-1163)
- Modify: `src/renderer/pages/TournamentDetail.tsx` (`handleDeleteTeam` lines 485-490, `handleRemovePlayerFromTeam` lines 501-505)
- Test: covered by Task 8's IPC harness (backend check); no renderer test framework exists in this repo for manual click-driven flows, so the frontend half is verified by code review + the existing typecheck, consistent with how this codebase already handles renderer error-path testing (there is none — this is not a new gap this task introduces).

**Interfaces:**
- No new exports. Pure IPC handler + renderer handler changes.

- [ ] **Step 1: Add the FK check to `tournament:teams:delete`**

In `src/main/ipc.ts`, replace (currently lines 1158-1163):

```ts
ipcMain.handle('tournament:teams:delete', (_e, teamId: string) => {
  transaction(() => {
    run('DELETE FROM tournament_team_players WHERE teamId = ?', [teamId]);
    run('DELETE FROM tournament_teams WHERE id = ?', [teamId]);
  });
});
```

with:

```ts
ipcMain.handle('tournament:teams:delete', (_e, teamId: string) => {
  const referencing = queryOne<{ id: string }>(
    'SELECT id FROM tournament_team_matches WHERE team1Id = ? OR team2Id = ? LIMIT 1', [teamId, teamId]
  );
  if (referencing) throw new Error('Cannot delete a team that already has generated matches');
  transaction(() => {
    run('DELETE FROM tournament_team_players WHERE teamId = ?', [teamId]);
    run('DELETE FROM tournament_teams WHERE id = ?', [teamId]);
  });
});
```

- [ ] **Step 2: Add error handling to the two renderer handlers**

In `src/renderer/pages/TournamentDetail.tsx`, replace `handleDeleteTeam` (currently lines 485-490):

```ts
const handleDeleteTeam = async (teamId: string) => {
  const ok = await confirm({ title: 'Delete team?', message: 'This will remove all team members from this team.', confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  setTeamError(null);
  try {
    await (window.api as any).tournamentTeamsDelete(teamId);
    await load();
  } catch (err: any) {
    setTeamError(err?.message ?? 'Failed to delete team');
  }
};
```

Replace `handleRemovePlayerFromTeam` (currently lines 501-505):

```ts
const handleRemovePlayerFromTeam = async (teamId: string, playerId: string) => {
  setTeamError(null);
  try {
    await (window.api as any).tournamentTeamsRemovePlayer(teamId, playerId);
    await loadTeamPlayers(teamId);
    await load();
  } catch (err: any) {
    setTeamError(err?.message ?? 'Failed to remove player');
  }
};
```

- [ ] **Step 3: Typecheck both configs**

Run: `rtk proxy npx tsc -p tsconfig.node.json --noEmit` and `rtk proxy npx tsc --noEmit`
Expected: both exit 0.

- [ ] **Step 4: Run the full existing suite**

Run: `npx vitest run src/__tests__`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts src/renderer/pages/TournamentDetail.tsx
git commit -m "fix: reject deleting a team with generated matches; surface the error in the UI"
```

---

## Task 4: `roundRobinMatchCount()` + court/match-number cursor threading (I1)

**Files:**
- Modify: `src/main/tournament.ts` (`generateRoundRobinMatches`, currently lines 161-198; add `roundRobinMatchCount` near it)
- Modify: `src/main/ipc.ts` (the `generateBracket` mixed branch's per-group loop, currently lines 891-902; the `reassignGroup` per-group loop, currently lines 1024-1034)
- Test: `src/__tests__/tournament.test.ts`

**Interfaces:**
- Produces: `export function roundRobinMatchCount(participantCount: number): number`; `generateRoundRobinMatches` gains two new optional parameters `startMatchNumber = 1, startCourtIndex = 0` — return type unchanged (`TournamentMatchRecord[]`).

- [ ] **Step 1: Write the failing tests**

Add to `src/__tests__/tournament.test.ts`, in a new `describe('roundRobinMatchCount', ...)` block after the existing round-robin test:

```ts
describe('roundRobinMatchCount', () => {
  it('computes the standard round-robin total for an even participant count', () => {
    expect(roundRobinMatchCount(4)).toBe(6); // C(4,2)
  });

  it('computes the standard round-robin total for an odd participant count (byes do not change the total)', () => {
    expect(roundRobinMatchCount(5)).toBe(10); // C(5,2) — one bye per round, still every pair plays once
  });
});
```

Add to the existing `describe('tournament scheduling', ...)` block (after the existing `it('keeps round-robin logical rounds intact...')` test, which stays unchanged):

```ts
it('offsets match numbers and court assignment when given a starting cursor', () => {
  const matches = generateRoundRobinMatches('t1', ['a', 'b', 'c', 'd'].map(team), 2, ids(), 10, 1);
  expect(matches[0]!.matchNumber).toBe(10);
  expect(matches[0]!.courtNumber).toBe(2); // ((1 + 0) % 2) + 1
  expect(matches[1]!.matchNumber).toBe(11);
});
```

Add `roundRobinMatchCount` to the existing import block.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/tournament.test.ts -t "roundRobinMatchCount"` and `npx vitest run src/__tests__/tournament.test.ts -t "offsets match numbers"`
Expected: both FAIL (`roundRobinMatchCount` not exported; cursor params don't exist yet, so match numbers/courts start from 1/no-offset).

- [ ] **Step 3: Implement `roundRobinMatchCount`**

In `src/main/tournament.ts`, add near `generateRoundRobinMatches` (before or after it, either is fine — place it directly above, currently line 161):

```ts
export function roundRobinMatchCount(participantCount: number): number {
  return (participantCount * (participantCount - 1)) / 2;
}
```

- [ ] **Step 4: Add the cursor parameters to `generateRoundRobinMatches`**

Change the signature (currently lines 161-166):

```ts
export function generateRoundRobinMatches(
  tournamentId: string,
  registrations: TournamentRegistration[],
  courtCount: number,
  makeId: IdFactory,
  startMatchNumber = 1,
  startCourtIndex = 0,
): TournamentMatchRecord[] {
```

Inside the function body, change `let matchNumber = 1;` to `let matchNumber = startMatchNumber;`. Change the court computation from `(matchInRound % courts) + 1` to `((startCourtIndex + matchInRound) % courts) + 1`. Everything else in the function body stays the same.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/tournament.test.ts -t "roundRobinMatchCount"` and `npx vitest run src/__tests__/tournament.test.ts -t "offsets match numbers"`
Expected: both PASS.

- [ ] **Step 6: Run the existing round-robin test to confirm backward compatibility**

Run: `npx vitest run src/__tests__/tournament.test.ts -t "keeps round-robin logical rounds intact"`
Expected: PASS unchanged — this test calls `generateRoundRobinMatches` with exactly 4 positional args, so `startMatchNumber`/`startCourtIndex` default to `1`/`0`, reproducing the exact current behavior.

- [ ] **Step 7: Thread the cursor through `generateBracket`'s mixed branch**

In `src/main/ipc.ts`, replace the per-group loop inside the `mixed` branch (currently lines 890-902):

```ts
        const allMatches: TournamentMatchRecord[] = [];
        let matchNumberCursor = 1;
        let courtIndexCursor = 0;
        for (const g of groups) {
          const groupRegs = byGroup.get(g.id) ?? [];
          if (groupRegs.length > 0) {
            run('UPDATE tournament_registrations SET groupId = ? WHERE id IN (' + groupRegs.map(() => '?').join(',') + ')',
              [g.id, ...groupRegs.map(r => r.id)]);
          }
          const groupMatches = generateRoundRobinMatches(tournamentId, groupRegs, t.courtCount, uuid, matchNumberCursor, courtIndexCursor);
          for (const match of groupMatches) {
            insertTournamentMatch({ ...match, groupId: g.id });
            allMatches.push(match);
          }
          matchNumberCursor += roundRobinMatchCount(groupRegs.length);
          courtIndexCursor = (courtIndexCursor + roundRobinMatchCount(groupRegs.length)) % t.courtCount;
        }
```

- [ ] **Step 8: Thread the cursor through `reassignGroup`'s regeneration loop**

In `src/main/ipc.ts`, replace the loop inside `tournaments:reassignGroup` (currently lines 1024-1034):

```ts
      const courtCount = t?.courtCount ?? 4;
      let matchNumberCursor = 1;
      let courtIndexCursor = 0;
      for (const gid of [oldGroupId, newGroupId]) {
        const groupRegs = queryAll<TournamentRegistration>(
          `SELECT tr.*, p1.level as player1Level, p2.level as player2Level
           FROM tournament_registrations tr
           JOIN players p1 ON tr.player1Id = p1.id
           LEFT JOIN players p2 ON tr.player2Id = p2.id
           WHERE tr.groupId = ?`, [gid]
        );
        const groupMatches = generateRoundRobinMatches(reg.tournamentId, groupRegs, courtCount, uuid, matchNumberCursor, courtIndexCursor);
        for (const match of groupMatches) insertTournamentMatch({ ...match, groupId: gid });
        matchNumberCursor += roundRobinMatchCount(groupRegs.length);
        courtIndexCursor = (courtIndexCursor + roundRobinMatchCount(groupRegs.length)) % courtCount;
      }
```

(Note: this replaces the existing `const t = queryOne<{ courtCount: number }>(...)` line's usage — keep that query as-is, just add the `const courtCount = t?.courtCount ?? 4;` line right after it and use `courtCount` in place of the old inline `t?.courtCount ?? 4` fallback each loop iteration used before.)

- [ ] **Step 9: Add `roundRobinMatchCount` and no new imports needed for ipc.ts**

`roundRobinMatchCount` needs to be added to the existing `import { ... } from './tournament';` block in `ipc.ts`.

- [ ] **Step 10: Typecheck and run the full suite**

Run: `rtk proxy npx tsc -p tsconfig.node.json --noEmit` and `npx vitest run src/__tests__`
Expected: both clean.

- [ ] **Step 11: Commit**

```bash
git add src/main/tournament.ts src/main/ipc.ts src/__tests__/tournament.test.ts
git commit -m "fix: thread match-number and court cursors across mixed-format groups"
```

---

## Task 5: Standings tiebreak uses sets won/lost (I2)

**Files:**
- Modify: `src/main/tournament.ts` (`computeTournamentStandings`'s sort, currently line 412)
- Test: `src/__tests__/tournament.test.ts`

**Interfaces:**
- No signature changes — `computeTournamentStandings`'s return type and the `TournamentStanding`/`GroupStanding` shapes are unchanged (they already carry `setsWon`/`setsLost`).

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/tournament.test.ts`, in the existing `describe('tournament scheduling', ...)` block, after the existing `it('sums actual per-set points for standings tiebreakers...')` test:

```ts
it('breaks a standings tie on sets won/lost before falling back to point differential', () => {
  // Both teams: 1 win, 1 loss, identical point totals (42 for, 42 against) —
  // only sets differ. b: 2-1 (won more sets); c: 1-2 (won fewer sets).
  const standings = computeTournamentStandings([
    {
      id: 'm1', tournamentId: 't1', round: 'RR', matchNumber: 1, courtNumber: 1, status: 'completed',
      team1Player1Id: 'b', team1Player2Id: null, team2Player1Id: 'x', team2Player2Id: null,
      team1Score: 2, team2Score: 1,
      set1Team1Score: 21, set1Team2Score: 10, set2Team1Score: 10, set2Team2Score: 21, set3Team1Score: 21, set3Team2Score: 15,
      winner: 'team1', completedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'm2', tournamentId: 't1', round: 'RR', matchNumber: 2, courtNumber: 1, status: 'completed',
      team1Player1Id: 'b', team1Player2Id: null, team2Player1Id: 'y', team2Player2Id: null,
      team1Score: 0, team2Score: 2,
      set1Team1Score: 5, set1Team2Score: 21, set2Team1Score: 6, set2Team2Score: 21,
      winner: 'team2', completedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'm3', tournamentId: 't1', round: 'RR', matchNumber: 3, courtNumber: 1, status: 'completed',
      team1Player1Id: 'c', team1Player2Id: null, team2Player1Id: 'z', team2Player2Id: null,
      team1Score: 2, team2Score: 1,
      set1Team1Score: 21, set1Team2Score: 19, set2Team1Score: 19, set2Team2Score: 21, set3Team1Score: 21, set3Team2Score: 19,
      winner: 'team1', completedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'm4', tournamentId: 't1', round: 'RR', matchNumber: 4, courtNumber: 1, status: 'completed',
      team1Player1Id: 'c', team1Player2Id: null, team2Player1Id: 'w', team2Player2Id: null,
      team1Score: 0, team2Score: 2,
      set1Team1Score: 10, set1Team2Score: 21, set2Team1Score: 12, set2Team2Score: 21,
      winner: 'team2', completedAt: '2026-01-01T00:00:00.000Z',
    },
  ]);

  const b = standings.find(s => s.player1Id === 'b')!;
  const c = standings.find(s => s.player1Id === 'c')!;
  expect(b.wins).toBe(c.wins);
  expect(b.pf - b.pa).toBe(c.pf - c.pa); // point diff is deliberately tied: b = (21+10+21+5+6+21)... verify below
  expect(b.setsWon).toBeGreaterThan(c.setsWon);
  const order = standings.map(s => s.player1Id);
  expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
});
```

Before running this, hand-verify the point-differential tie holds for the fixture above (the test's own comment claims it does — Step 2 will catch it if the arithmetic is wrong, since the test would fail for the wrong reason). If `expect(b.pf - b.pa).toBe(c.pf - c.pa)` fails, adjust the set scores in the fixture (keeping every set individually a valid badminton score via `computeMatchOutcome`'s rules is not required here since `computeTournamentStandings` reads the raw set fields directly, not through `computeMatchOutcome`) until the point-differential really does tie, then re-verify the sets-won values still favor `b`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/tournament.test.ts -t "breaks a standings tie on sets"`
Expected: FAIL — without the sets tiebreak, `b` and `c` are tied on both `wins` and point differential, so their relative order is whatever the sort's stability happens to produce, not guaranteed to put `b` first.

- [ ] **Step 3: Implement**

In `src/main/tournament.ts`, change the sort (currently line 412):

```ts
return [...standings.values()].sort((a, b) =>
  b.wins - a.wins
  || (b.setsWon - b.setsLost) - (a.setsWon - a.setsLost)
  || (b.pf - b.pa) - (a.pf - a.pa)
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/tournament.test.ts -t "breaks a standings tie on sets"`
Expected: PASS.

- [ ] **Step 5: Run the full existing suite**

Run: `npx vitest run src/__tests__`
Expected: all pass — the existing standings tests don't rely on any specific tie-order beyond wins/point-diff, so adding a tiebreak stage between them doesn't change any prior assertion's outcome (verify this by reading the existing `computeTournamentStandings` tests in the file if any failure appears; none are expected).

- [ ] **Step 6: Commit**

```bash
git add src/main/tournament.ts src/__tests__/tournament.test.ts
git commit -m "fix: use sets won/lost as a standings tiebreak before point differential"
```

---

## Task 6: Seed/pairing direction fixed to descending (I3/I4)

**Files:**
- Modify: `src/main/tournament.ts` (`generateKnockoutMatches` line 138, `pairAdjacentByLevel` line 591, `pairMixedByLevel` lines 602-603)
- Test: `src/__tests__/tournament.test.ts` (update three existing test expectations — hand-verified below, not left for the implementer to re-derive)

**Interfaces:** No signature changes.

**Important:** `assignRegistrationsToGroups` (line 211, snake-draft group assignment) uses the same `avgLevel(a) - avgLevel(b)` pattern but is **not** touched by this task — its sort direction doesn't affect group balance, only which end of the standings the snake starts from, and flipping it would only cause spurious test diffs with no behavioral benefit.

- [ ] **Step 1: Flip the three sort directions**

In `src/main/tournament.ts`:
- Line 138 (`generateKnockoutMatches`): change `sort((a, b) => avgLevel(a) - avgLevel(b))` to `sort((a, b) => avgLevel(b) - avgLevel(a))`.
- Line 591 (`pairAdjacentByLevel`): change `sort((a, b) => a.level - b.level)` to `sort((a, b) => b.level - a.level)`.
- Lines 602-603 (`pairMixedByLevel`): change both `sort((a, b) => a.level - b.level)` to `sort((a, b) => b.level - a.level)`.

Do not touch line 211 (`assignRegistrationsToGroups`).

- [ ] **Step 2: Update the existing test in `describe('buildTeamMatchGames', ...)` — "pairs doubles partners by adjacent level after sorting, not roster order"**

The four existing `generateKnockoutMatches` tests in `describe('tournament scheduling', ...)` (currently the ones using `['a','b','c','d'].map(team)` / `['a','b'].map(team)` etc.) all use the `team()` helper's default `level = 3` for every entrant — with every level tied, a stable sort produces the identical element order regardless of comparator direction, so **none of those tests need any expectation changes.** Only the tests that pass genuinely different levels are affected — verify this by re-running the full suite in Step 5 rather than assuming; if any of those four tests fail, that assumption was wrong and needs re-investigation before proceeding, not a blind expectation update.

In `src/__tests__/tournament.test.ts`, update the test (currently lines 363-373):

```ts
it('pairs doubles partners by adjacent level after sorting, not roster order', () => {
  const team1 = [rosterPlayer('strong', 'male', 5), rosterPlayer('weak', 'male', 1), rosterPlayer('mid1', 'male', 3), rosterPlayer('mid2', 'male', 3)];
  const team2 = [rosterPlayer('a', 'male', 2), rosterPlayer('b', 'male', 2)];
  const result = buildTeamMatchGames(team1, team2, { ms: 0, ws: 0, md: 2, xd: 0, wd: 0 });

  expect(result.skipped).toEqual([]);
  // Sorted by level descending: strong(5), mid1(3), mid2(3), weak(1) -> pairs: [strong,mid1], [mid2,weak]
  expect(result.games).toHaveLength(2);
  expect(result.games[0]).toMatchObject({ category: 'MD', slotNumber: 1, team1Player1Id: 'strong', team1Player2Id: 'mid1' });
  expect(result.games[1]).toMatchObject({ category: 'MD', slotNumber: 2, team1Player1Id: 'mid2', team1Player2Id: 'weak' });
});
```

(Hand-derivation: input order is strong,weak,mid1,mid2. Descending by level: strong(5) first; mid1 and mid2 are tied at level 3, and `Array.prototype.sort` is stable, so ties keep their original relative order — mid1 appears before mid2 in the input, so it stays before mid2 in the output; weak(1) last. Sorted = [strong, mid1, mid2, weak]. Pairs of 2 consecutive: [strong,mid1], [mid2,weak].)

- [ ] **Step 3: Update the existing test — "pairs mixed doubles by matching rank between the male and female pools"**

Replace (currently lines 375-387):

```ts
it('pairs mixed doubles by matching rank between the male and female pools', () => {
  const team1 = [
    rosterPlayer('m-low', 'male', 1), rosterPlayer('m-high', 'male', 5),
    rosterPlayer('f-low', 'female', 2), rosterPlayer('f-high', 'female', 4),
  ];
  const team2 = [rosterPlayer('om', 'male', 3), rosterPlayer('of', 'female', 3)];
  const result = buildTeamMatchGames(team1, team2, { ms: 0, ws: 0, md: 0, xd: 2, wd: 0 });

  expect(result.skipped).toEqual([]);
  // Male sorted descending: m-high(5), m-low(1). Female sorted descending: f-high(4), f-low(2). Rank-matched pairs: [m-high,f-high], [m-low,f-low]
  expect(result.games[0]).toMatchObject({ category: 'XD', slotNumber: 1, team1Player1Id: 'm-high', team1Player2Id: 'f-high' });
  expect(result.games[1]).toMatchObject({ category: 'XD', slotNumber: 2, team1Player1Id: 'm-low', team1Player2Id: 'f-low' });
});
```

- [ ] **Step 4: Update the existing test — "locks in the documented forced-reuse wraparound"**

Replace (currently lines 417-427):

```ts
it('locks in the documented forced-reuse wraparound: scarce pools can wrap lowest-to-highest', () => {
  // Design spec (docs/superpowers/specs/2026-07-12-team-match-composition-design.md, Edge Cases):
  // a 3-player pool asked for 2 pairs produces a first pair from the top two
  // sorted players, then wraps so the pair straddling the wrap point is
  // always the sorted list's first and last entries — direction-independent.
  const team1 = [rosterPlayer('lvl1', 'male', 1), rosterPlayer('lvl3', 'male', 3), rosterPlayer('lvl5', 'male', 5)];
  const team2 = [rosterPlayer('a', 'male', 2), rosterPlayer('b', 'male', 2)];
  const result = buildTeamMatchGames(team1, team2, { ms: 0, ws: 0, md: 2, xd: 0, wd: 0 });

  expect(result.skipped).toEqual([]);
  // Sorted descending: lvl5, lvl3, lvl1. Pairs: [lvl5,lvl3], then wraps to [lvl1,lvl5].
  expect(result.games[0]).toMatchObject({ slotNumber: 1, team1Player1Id: 'lvl5', team1Player2Id: 'lvl3' });
  expect(result.games[1]).toMatchObject({ slotNumber: 2, team1Player1Id: 'lvl1', team1Player2Id: 'lvl5' });
});
```

(This is a genuine behavior change worth calling out explicitly, not just silently patched: the wraparound pair still contains the same two people — level 1 and level 5 — under either sort direction, since the wraparound always connects the sorted list's first and last positions regardless of which end is "first". Only which one lands in `team1Player1Id` vs `team1Player2Id` swaps, and which *other* player each of them gets paired with in the non-wraparound pair changes. No change needed to `docs/superpowers/specs/2026-07-12-team-match-composition-design.md` — its Edge Cases line describes the pairing by naming which two players end up together, not by which position they occupy, so it remains accurate.)

- [ ] **Step 5: Run the full existing suite**

Run: `npx vitest run src/__tests__`
Expected: all pass, including the three updated tests and the four unaffected `generateKnockoutMatches`/`buildNextKnockoutMatches` tests in `describe('tournament scheduling', ...)`.

- [ ] **Step 6: Commit**

```bash
git add src/main/tournament.ts src/__tests__/tournament.test.ts
git commit -m "fix: seed knockout byes and team-rubber pairing by strength descending, not ascending"
```

---

## Task 7: Standings query scoping (I5) + `assignCourt` status guard (I7)

**Files:**
- Modify: `src/main/ipc.ts` (`tournaments:standings`, `tournament:teamMatches:assignCourt`)
- Test: covered by Task 8's IPC harness (both are pure query/guard changes on IPC handlers, no pure-function equivalent to unit test directly).

**Interfaces:** No signature changes.

- [ ] **Step 1: Scope `tournaments:standings` to exclude rubbers and group matches**

In `src/main/ipc.ts`, find the `tournaments:standings` handler's match query (currently: `"SELECT * FROM tournament_matches WHERE tournamentId = ? AND status = 'completed'"`) and change it to:

```ts
const matches = queryAll<TournamentMatchRecord>(
  "SELECT * FROM tournament_matches WHERE tournamentId = ? AND status = 'completed' AND teamMatchId IS NULL AND groupId IS NULL",
  [tournamentId]
);
```

- [ ] **Step 2: Guard `assignCourt` against resetting a completed match**

In `src/main/ipc.ts`, find the `tournament:teamMatches:assignCourt` handler's UPDATE (currently: `"UPDATE tournament_matches SET courtNumber = ?, status = 'in_progress' WHERE id = ?"`) and change it to:

```ts
run(
  "UPDATE tournament_matches SET courtNumber = ?, status = 'in_progress' WHERE id = ? AND status != 'completed'",
  [courtNumber, gameId]
);
```

- [ ] **Step 3: Typecheck and run the full suite**

Run: `rtk proxy npx tsc -p tsconfig.node.json --noEmit` and `npx vitest run src/__tests__`
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc.ts
git commit -m "fix: scope standings to bracket-only matches; assignCourt no longer resets a completed match"
```

---

## Task 8: IPC-handler test harness + regression coverage for Tasks 2, 3, 7

**Files:**
- Create: `src/__tests__/ipcHandlers.test.ts`

**Interfaces:**
- Consumes: `registerIpcHandlers` (`src/main/ipc.ts`, existing export), `closeDb` (`src/main/database.ts`, existing export), `ipcMain` (mocked `electron`).

- [ ] **Step 1: Write the test file's setup, reusing the existing mock pattern**

Create `src/__tests__/ipcHandlers.test.ts`:

```ts
import fs from 'fs';
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
import { closeDb } from '../main/database';
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
```

- [ ] **Step 2: Write the failing test for Task 2 — scoring a rubber reconciles the parent team match**

Add to the same file:

```ts
describe('tournaments:setScore / tournament:teamMatches:setScore (applyMatchScore)', () => {
  it('scoring a team-tournament rubber reconciles the parent team match', async () => {
    const handlers = await setupHandlers();

    const t = await call(handlers, 'tournaments:create', { name: 'T', date: '2026-01-01', format: 'mixed' });
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
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/__tests__/ipcHandlers.test.ts`
Expected: FAIL before Task 2's fix would have been applied — but Task 2 is already committed by this point in the plan, so this specific assertion should already PASS. If it fails, that means Task 2's fix has a regression; stop and investigate rather than proceeding to add more tests on top of a broken fix. (This step's real purpose, given Task 2 already landed, is to prove Task 2's fix works — not to re-discover a bug that's already fixed.)

- [ ] **Step 4: Add the re-score guard tests (Task 2)**

Add to the same `describe` block:

```ts
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

  await expect(
    call(handlers, 'tournaments:setScore', sfMatches[0].id, [{ team1: 15, team2: 21 }, { team1: 10, team2: 21 }])
  ).rejects.toThrow(/later round/i);
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

  await expect(
    call(handlers, 'tournaments:setScore', groupMatches[0].id, [{ team1: 15, team2: 21 }, { team1: 10, team2: 21 }])
  ).rejects.toThrow(/knockout stage/i);
});
```

- [ ] **Step 5: Add the Task 3 regression test (team-delete FK check)**

Add a new `describe` block:

```ts
describe('tournament:teams:delete', () => {
  it('rejects deleting a team that already has generated matches', async () => {
    const handlers = await setupHandlers();
    const t = await call(handlers, 'tournaments:create', { name: 'T', date: '2026-01-01', format: 'mixed' });
    const p1 = await call(handlers, 'players:create', { name: 'A', gender: 'male', level: 3, phone: '' });
    const p2 = await call(handlers, 'players:create', { name: 'B', gender: 'male', level: 3, phone: '' });
    const team1 = await call(handlers, 'tournament:teams:create', t.id, 'Team 1');
    const team2 = await call(handlers, 'tournament:teams:create', t.id, 'Team 2');
    await call(handlers, 'tournament:teams:addPlayer', team1.id, p1.id);
    await call(handlers, 'tournament:teams:addPlayer', team2.id, p2.id);
    await call(handlers, 'tournament:teamMatches:generate', t.id, { ms: 1, ws: 0, md: 0, xd: 0, wd: 0 });

    await expect(call(handlers, 'tournament:teams:delete', team1.id)).rejects.toThrow(/generated matches/i);
  });

  it('allows deleting a team with no generated matches', async () => {
    const handlers = await setupHandlers();
    const t = await call(handlers, 'tournaments:create', { name: 'T', date: '2026-01-01', format: 'mixed' });
    const team1 = await call(handlers, 'tournament:teams:create', t.id, 'Team 1');
    await expect(call(handlers, 'tournament:teams:delete', team1.id)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 6: Add the Task 7 regression tests**

Add a new `describe` block:

```ts
describe('tournaments:standings scoping (I5) and assignCourt guard (I7)', () => {
  it('excludes team-tournament rubbers from tournaments:standings', async () => {
    const handlers = await setupHandlers();
    const t = await call(handlers, 'tournaments:create', { name: 'T', date: '2026-01-01', format: 'mixed' });
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
    const t = await call(handlers, 'tournaments:create', { name: 'T', date: '2026-01-01', format: 'mixed' });
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

    await call(handlers, 'tournament:teamMatches:assignCourt', games[0].id, 3);

    const updatedGames = await call(handlers, 'tournament:teamMatches:listGames', teamMatches[0].id);
    expect(updatedGames[0].status).toBe('completed');
  });
});
```

- [ ] **Step 7: Run the whole new file**

Run: `npx vitest run src/__tests__/ipcHandlers.test.ts`
Expected: all tests PASS (Tasks 2, 3, and 7's fixes are already committed by this point in the plan, so this file's whole purpose is to lock them in as regression tests, not to discover new failures).

- [ ] **Step 8: Run the full suite one final time**

Run: `rtk proxy npx tsc -p tsconfig.node.json --noEmit`, `rtk proxy npx tsc --noEmit`, and `npx vitest run src/__tests__`
Expected: all clean.

- [ ] **Step 9: Commit**

```bash
git add src/__tests__/ipcHandlers.test.ts
git commit -m "test: add IPC-handler test harness with regression coverage for the match-kind refactor"
```

---

## Task 9: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Build**

```bash
npm run build:main && npx vite build
```

- [ ] **Step 2: Run the full test suite one more time against the built state**

```bash
rtk proxy npx vitest run src/__tests__
```

- [ ] **Step 3: Live-verify the three Critical fixes in the running app**

This repo's Electron binary is a Windows `.exe`; Playwright's `_electron.launch()` does not attach from this WSL session. Launch directly with `--remote-debugging-port` and drive it via raw CDP (`Target.attachToTarget` + `Runtime.evaluate`), the pattern already proven earlier in this project's development:

- Create a Team Tournament, generate a rubber, score it via `window.api.tournamentsSetScore` (not `tournamentTeamMatchesSetScore`) — confirm `tournament:teamMatches:list` shows the parent team match as `completed` with the right win count (Critical #1).
- Create a knockout tournament, complete the SF round, advance to F, then attempt to re-score an SF match — confirm it throws with a "later round" message instead of silently succeeding (Critical #2).
- Create a Team Tournament, generate matches for two teams, attempt to delete one of the teams — confirm the UI shows an error message (not a silent no-op) instead of a raw exception (Critical #3).

- [ ] **Step 4: Report results**

Summarize pass/fail for each of the three live checks. If anything fails, return to the relevant task rather than patching ad hoc — this is a verification task, not a fix-it task.

---

## Self-Review Notes

- **Spec coverage:** every requirement in the spec maps to a task — `matchKind` (Task 1), unified scoring + re-score guard (Task 2), team-delete FK check (Task 3), I1 (Task 4), I2 (Task 5), I3/I4 (Task 6), I5 + I7 (Task 7), IPC test harness (Task 8).
- **Type consistency:** `MatchKind`, `matchKind()`, `knockoutRoundName()`, `roundRobinMatchCount()`, `applyMatchScore()` are each defined once (Tasks 1, 2, 4) and referenced by the same names in every later task that touches them.
- **Two design-time gaps already caught and fixed during the spec's own self-review** (not repeated here): the bracket re-score guard reuses `knockoutRoundName` instead of a naive "any other round" check that would false-block the Final; `generateRoundRobinMatches` keeps its existing return type instead of introducing a breaking cursor-object return, avoiding changes to its one non-grouped caller and to `tournament.test.ts:39`.
- **A third gap caught during this plan's own writing** (Task 6): naively assumed all four existing `generateKnockoutMatches` tests would need updated expectations from the seed-direction flip — hand-verified against the actual test fixtures and found they all use the `team()` helper's default tied level, so a stable sort produces identical output regardless of direction; only the three `buildTeamMatchGames` tests that use genuinely distinct levels are affected, and their new expected values are hand-derived in Task 6 rather than left for the implementer to guess.
