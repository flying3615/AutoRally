# Match Scheduling Test Coverage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add deterministic algorithm, hook orchestration, and browser-level
tests for player scheduling without changing scheduling behavior.

**Architecture:** Keep scoring guarantees in `matching.test.ts`, exercise
`useMatchGeneration` with a mocked Electron API and React's server renderer,
and assert persisted game semantics in the existing Playwright match flow.
Tests assert invariants and required IPC effects instead of a single lineup
when multiple lineups are equally valid.

**Tech Stack:** TypeScript, Vitest 4, React 19 server renderer, Playwright,
Electron IPC mocks.

---

### Task 1: Add algorithm invariant and history coverage

**Files:**
- Modify: `src/__tests__/matching.test.ts`
- Test: `src/__tests__/matching.test.ts`

**Step 1: Write the failing helper and tests**

Add test-local helpers that collect a match's four IDs and derive its expected
type from player genders. Add these cases to the `generateMatches` suite:

```ts
function assertMatchesAreValid(
  pool: PlayerInPool[],
  matches: MatchResult[],
  courtCount: number,
) {
  expect(matches.length).toBeLessThanOrEqual(courtCount);
  const used = matches.flatMap(match => [...match.team1, ...match.team2]);
  expect(new Set(used).size).toBe(used.length);
  for (const match of matches) {
    const players = [...match.team1, ...match.team2]
      .map(id => pool.find(player => player.id === id)!);
    expect(players).not.toContain(undefined);
    // Assert mixed, single-gender, and 3:1 open-double compositions.
  }
}

it('keeps a full valid schedule above the per-level candidate cap', () => {
  const pool = Array.from({ length: 40 }, (_, index) =>
    makePlayer(`p${index}`, `P${index}`, index % 2 ? 'male' : 'female', 3, index),
  );
  assertMatchesAreValid(pool, generateMatches(pool, 4, 1, []), 4);
});
```

Add a `playing`-history test with eight same-level players where the first four
are in a playing game; scheduling one new court must choose the four players
without a counted game. Add a late-arrival test that includes older completed
rounds and a newly checked-in player, asserting the generated result remains
valid and selects the player with zero games.

**Step 2: Run the focused test to verify the new assertions**

Run:

```bash
npx vitest run src/__tests__/matching.test.ts
```

Expected: the file passes after test-only additions; investigate any
non-deterministic assertion before continuing.

**Step 3: Add deterministic varied-pool invariant coverage**

Create a small, deterministic table of varied pools (gender imbalance, levels
1-5, court counts 1-4, and 37+ players). Run `generateMatches` for each and
call `assertMatchesAreValid`. Do not require all courts to fill in a
deliberately impossible pool.

**Step 4: Run the focused test suite**

Run:

```bash
npx vitest run src/__tests__/matching.test.ts
```

Expected: all existing and new matching tests pass.

**Step 5: Commit**

```bash
git add src/__tests__/matching.test.ts
git commit -m "test: cover match scheduling edge cases"
```

### Task 2: Test `useMatchGeneration` orchestration

**Files:**
- Create: `src/__tests__/useMatchGeneration.test.ts`
- Test: `src/__tests__/useMatchGeneration.test.ts`

**Step 1: Write a hook capture helper**

Use the installed React server renderer so no new browser-test dependency is
needed:

```ts
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';
import { useMatchGeneration } from '../renderer/pages/matchPanel/useMatchGeneration';

function captureGenerate(params: Parameters<typeof useMatchGeneration>[0]) {
  let generate: ReturnType<typeof useMatchGeneration> | undefined;
  function Harness() {
    generate = useMatchGeneration(params);
    return null;
  }
  renderToStaticMarkup(createElement(Harness));
  return generate!;
}
```

In `beforeEach`, install `window.api` with `vi.stubGlobal`, providing mocked
`gamesListBySession`, `gamesDelete`, `gamesMaxRound`, and `gamesCreate`.
Restore globals in `afterEach`.

**Step 2: Write the pending-cleanup test**

Mock one pending game and one completed game. Supply eight eligible attendance
records plus one paused record. Invoke the captured callback and assert:

```ts
expect(api.gamesDelete).toHaveBeenCalledWith('pending-game-id');
expect(api.gamesMaxRound).toHaveBeenCalledWith('session-id');
expect(api.gamesCreate).toHaveBeenCalledTimes(2);
expect(createdGames.every(game => game.roundNumber === 6)).toBe(true);
expect(createdIds).not.toContain('paused-player-id');
```

Also assert `load` is called once and each created game has four unique IDs.

**Step 3: Run the new test to verify its baseline**

Run:

```bash
npx vitest run src/__tests__/useMatchGeneration.test.ts
```

Expected: PASS using the existing hook behavior. If server rendering cannot
capture the callback, replace only the harness with the smallest supported
React rendering mechanism; do not change production scheduling code.

**Step 4: Add active-player fallback coverage**

Set two courts, four waiting players, and four active-game players. Pass the
same active game through `freshGames` and `activeGames`; assert two pending
games are created, their eight IDs are unique, and all IDs came from the
waiting-or-active eligible set.

**Step 5: Add silent insufficient-pool coverage**

Supply fewer than four eligible players and call the callback with
`{ silent: true }`. Assert it resolves `false`, calls no `gamesCreate`, calls
no global `alert`, and does not call `load`.

**Step 6: Run matching and hook tests**

Run:

```bash
npx vitest run src/__tests__/matching.test.ts src/__tests__/useMatchGeneration.test.ts
```

Expected: all tests pass.

**Step 7: Commit**

```bash
git add src/__tests__/useMatchGeneration.test.ts
git commit -m "test: cover match generation orchestration"
```

### Task 3: Add persisted-match semantic E2E coverage

**Files:**
- Modify: `e2e/match.spec.ts`
- Test: `e2e/match.spec.ts`

**Step 1: Write E2E assertion helpers**

At the top of the spec, add a helper that checks a stored game:

```ts
function assertStoredGameIsValid(game: any, playerById: Map<string, any>) {
  const ids = [
    game.team1Player1Id, game.team1Player2Id,
    game.team2Player1Id, game.team2Player2Id,
  ];
  expect(new Set(ids).size).toBe(4);
  const genders = ids.map(id => playerById.get(id).gender);
  // Assert mixed = 2M/2F, male/female doubles = four of that gender,
  // and open-double = a 3:1 gender split.
}
```

**Step 2: Extend the full-court E2E test**

After generating four courts with 20 players, fetch stored games and the
created players. Assert all four pending games pass
`assertStoredGameIsValid`, no player appears twice in the round, and every ID
belongs to a checked-in player.

**Step 3: Run the focused E2E test**

Run:

```bash
npm run build && npx playwright test e2e/match.spec.ts --grep "fills four courts"
```

Expected: PASS.

**Step 4: Add paused and checked-out exclusion coverage**

Create ten same-level players and check them in. Pause one attendance record
and remove another through the app API before navigating to the match page.
Generate matches, then assert both excluded player IDs are absent, each stored
game is valid, and all selected IDs are members of the eight-player eligible
attendance set.

**Step 5: Run the affected E2E spec**

Run:

```bash
npm run build && npx playwright test e2e/match.spec.ts
```

Expected: all match-flow tests pass.

**Step 6: Commit**

```bash
git add e2e/match.spec.ts
git commit -m "test: assert scheduled match semantics end to end"
```

### Task 4: Verify the complete change

**Files:**
- Test: `src/__tests__/matching.test.ts`
- Test: `src/__tests__/useMatchGeneration.test.ts`
- Test: `e2e/match.spec.ts`

**Step 1: Run the full unit suite**

Run:

```bash
npm test
```

Expected: all unit test files pass.

**Step 2: Build and run the changed browser flow**

Run:

```bash
npm run build && npx playwright test e2e/match.spec.ts
```

Expected: the match-flow Playwright spec passes.

**Step 3: Inspect the final diff**

Run:

```bash
git --no-pager diff HEAD~3..HEAD -- src/__tests__/matching.test.ts src/__tests__/useMatchGeneration.test.ts e2e/match.spec.ts
git --no-pager status --short
```

Expected: only the intended test and plan changes are present.
