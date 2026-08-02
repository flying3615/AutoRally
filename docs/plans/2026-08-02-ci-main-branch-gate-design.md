# CI Main Branch Gate Design

## Goal

Run the project's type checking, unit tests, build, and Electron end-to-end
tests automatically for pull requests targeting `main` and for pushes to
`main`.

## CI Workflow

Add `.github/workflows/ci.yml` with a single `CI` workflow:

- triggers: `pull_request` targeting `main`, and `push` to `main`;
- permissions: read-only repository contents;
- concurrency: one run per workflow and branch/PR, cancelling stale
  in-progress runs;
- runtime: Node 22 with npm dependency caching.

The workflow has two independent jobs:

1. `quality`
   - `npm ci`
   - `npm run typecheck`
   - `npm test`
   - `npm run build`

2. `e2e`
   - `npm ci`
   - install Playwright's Chromium/Linux dependencies;
   - run the Electron suite under Xvfb with `npm run test:e2e`;
   - upload `test-results/` when the job fails.

Running the jobs independently lets type/unit/build failures complete quickly
without waiting for Electron tests, while both checks remain available for
future branch protection.

## Main Branch Protection

The repository is private and the current GitHub plan rejects branch
protection for it. Therefore this change cannot yet make the checks mandatory.

Once the repository is public or the account supports private-repository
branch protection, require pull requests and the following status checks for
`main`:

- `CI / quality`
- `CI / e2e`

The workflow is intentionally named and structured so those check names remain
stable.

## Non-goals

- No release packaging, publishing, or deployment workflow.
- No dependency-version changes.
- No attempt to bypass GitHub's plan limitation with a non-enforceable
workflow convention.
