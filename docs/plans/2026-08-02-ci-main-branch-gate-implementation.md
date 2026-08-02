# CI Main Branch Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add GitHub Actions checks for type safety, unit tests, builds, and
Electron E2E tests, ready to become `main` merge requirements when branch
protection is available.

**Architecture:** A single `CI` workflow triggers for pull requests targeting
`main` and pushes to `main`. Independent `quality` and `e2e` jobs minimize
feedback time while emitting stable check names, and a short operational
document explains how to activate those checks as required branch protection.

**Tech Stack:** GitHub Actions, Node.js 22, npm, Playwright, Electron, Xvfb.

---

### Task 1: Add the CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`
- Test: `.github/workflows/ci.yml` (reviewed against GitHub Actions syntax)

**Step 1: Create the workflow metadata and triggers**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

**Step 2: Add the `quality` job**

Add a Linux job named `quality` with checkout, Node 22 npm cache, and the
project's existing fast checks:

```yaml
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

**Step 3: Add the `e2e` job**

Add a separate Linux job named `e2e` with the same checkout and Node setup,
then install Chromium/Linux libraries and run Electron tests under Xvfb:

```yaml
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: xvfb-run --auto-servernum npm run test:e2e
      - name: Upload E2E artifacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-test-results
          path: test-results/
          if-no-files-found: warn
```

**Step 4: Validate the commands locally**

Run:

```bash
npm ci
npm run typecheck
npm test
npm run build
xvfb-run --auto-servernum npm run test:e2e
```

Expected: every project command completes successfully. If `xvfb-run` or
Playwright Linux dependencies are absent locally, run the applicable
Playwright install command and record the environment limitation rather than
changing the workflow.

**Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add main branch test workflow"
```

### Task 2: Document activation of branch protection

**Files:**
- Create: `docs/ci-main-branch-gate.md`
- Test: `docs/ci-main-branch-gate.md` (manual documentation review)

**Step 1: Write the current limitation**

Document that the private repository's current GitHub plan rejects branch
protection, so Actions runs automatically but cannot yet block a merge.

**Step 2: Write future activation steps**

Add concise GitHub web UI instructions for when the repository is public or
the account supports private branch protection:

1. Open **Settings → Branches** and add or edit the `main` rule.
2. Require a pull request before merging.
3. Require status checks to pass before merging.
4. Select exactly `CI / quality` and `CI / e2e`.
5. Include administrators if maintainers should also be gated.

State that the checks first need one successful run before GitHub presents
them as selectable.

**Step 3: Review the document against the workflow**

Verify the documented check names match workflow name `CI` and job IDs
`quality`/`e2e`, and the trigger scope is `main`.

**Step 4: Commit**

```bash
git add docs/ci-main-branch-gate.md
git commit -m "docs: explain CI branch gate activation"
```

### Task 3: Verify the complete CI configuration

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `docs/ci-main-branch-gate.md`

**Step 1: Inspect the workflow and documentation diff**

Run:

```bash
git --no-pager diff main...HEAD -- .github/workflows/ci.yml docs/ci-main-branch-gate.md
```

Expected: only the intended workflow and activation guide changes appear.

**Step 2: Verify the quality commands**

Run:

```bash
npm ci && npm run typecheck && npm test && npm run build
```

Expected: all commands complete with zero failures.

**Step 3: Verify the browser-test command**

Run:

```bash
xvfb-run --auto-servernum npm run test:e2e
```

Expected: the Electron Playwright suite completes successfully. If the local
host lacks Xvfb or Playwright's Linux dependencies, report that exact
environment prerequisite; the workflow already installs the required
dependencies on `ubuntu-latest`.

**Step 4: Commit any verification-only follow-up**

If validation requires a workflow or document correction:

```bash
git add .github/workflows/ci.yml docs/ci-main-branch-gate.md
git commit -m "ci: correct main branch test gate"
```
