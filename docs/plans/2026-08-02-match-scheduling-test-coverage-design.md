# Match Scheduling Test Coverage Design

## Goal

Extend confidence in player scheduling beyond the existing pure-algorithm cases
by testing the orchestration hook and critical UI-to-database flows.

## Scope

### Algorithm tests

Extend `src/__tests__/matching.test.ts` with deterministic cases for:

- pools above the per-level candidate cap;
- accumulated and `playing` game history;
- players who join after earlier rounds;
- invariants across varied player pools: no duplicate player in a round, valid
  game-type gender composition, no more than the configured court count, and
  players drawn only from the supplied pool.

Tests should assert observable scheduling guarantees rather than assume that
the beam search finds a unique global optimum.

### Generation hook integration tests

Add a focused test for `useMatchGeneration` without introducing a browser test
dependency. A tiny component rendered with React's server renderer will expose
the hook callback, while a mocked `window.api` records IPC calls.

The tests will verify that the hook:

- removes existing pending games before scheduling;
- derives the next round after removal;
- excludes paused players;
- augments an undersized waiting pool with active players for next-round
  pre-scheduling;
- persists the generated player slots and game type; and
- returns `false` without an alert in silent insufficient-player mode.

### End-to-end tests

Extend `e2e/match.spec.ts` with a small number of semantic assertions over
games created through the visible match-generation flow:

- each generated court has four different players;
- its stored game type matches its players' genders;
- paused and checked-out players are not scheduled; and
- all generated player IDs belong to the session's eligible attendance pool.

## Non-goals

- Do not change scheduling rules or production APIs solely for testing.
- Do not assert an exact lineup where equally valid alternatives can differ.
- Do not move the algorithm's large candidate search to E2E.

## Validation

Run the focused Vitest files first, then the affected Playwright match spec.
