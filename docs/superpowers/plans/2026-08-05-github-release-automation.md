# GitHub Release Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically build and publish a Windows GitHub release with generated release notes whenever a changed application version reaches `main`.

**Architecture:** Extend `.github/workflows/ci.yml` with a release job that depends on the existing `quality` and `e2e` jobs. The workflow keeps `contents: read` at the top level, preserves pull-request cancellation plus unique non-canceling push workflow groups, and gives only the `release` job `contents: write`. That job runs only for a push to `main` whose `package.json` version increases from the previous commit, checks out with `fetch-depth: 0` and `persist-credentials: false`, serializes publication through a stable release concurrency group with `cancel-in-progress: false` and `queue: max`, builds the configured Windows portable executable on `windows-latest`, then uses GitHub CLI to create a uniquely tagged release with generated notes and the executable asset.

**Tech Stack:** GitHub Actions, Node.js 22, npm, Electron Builder, GitHub CLI (`gh`).

## Global Constraints

- Release only after the existing `quality` and `e2e` jobs pass.
- Build the configured Windows portable executable using `npm run dist:win`.
- Use tag format `vVERSION`, where `VERSION` is read from `package.json`.
- Generate release notes from merged pull requests and commits using GitHub's generated-notes support.
- Do not maintain or generate a repository `CHANGELOG.md`.
- Fail explicitly for invalid versions, missing artifacts, or existing release tags.
- Keep workflow permissions at `contents: read`; grant only the `release` job `contents: write`.
- Preserve the existing global concurrency behavior: PR runs still cancel superseded validations, while push workflow runs keep unique groups and are not canceled or replaced.
- Serialize release publication with a stable release job concurrency group, `cancel-in-progress: false`, and `queue: max`.
- Use `persist-credentials: false` on the release checkout step.
- Keep pull-request validation read-only and do not change the existing CI commands.

---

### Task 1: Add the gated GitHub release job

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: The existing `quality` and `e2e` jobs, `package.json` version, and GitHub Actions push event fields `github.event.before` and `github.sha`.
- Produces: A GitHub release tagged `vVERSION` with generated notes and `release/AutoRally VERSION.exe`.

- [ ] **Step 1: Keep workflow permissions read-only and scope write access to release**

Keep the workflow-level permission read-only and continue granting write access
only to the `release` job:

```yaml
permissions:
  contents: read

jobs:
  release:
    permissions:
      contents: write
```

The existing pull-request jobs remain read-only because they only use checkout,
dependency installation, tests, and builds; only the `release` job receives
contents write permission.

- [ ] **Step 2: Add a release job after the existing CI jobs**

Append this job to `.github/workflows/ci.yml`:

```yaml
  release:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs:
      - quality
      - e2e
    concurrency:
      group: ${{ github.workflow }}-release
      cancel-in-progress: false
      queue: max
    permissions:
      contents: write
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          persist-credentials: false

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Check for application version bump
        id: version
        shell: pwsh
        env:
          BEFORE_SHA: ${{ github.event.before }}
        run: |
          $script = @'
          const childProcess = require('node:child_process');
          const fs = require('node:fs');
          const current = require('./package.json');
          const previous = JSON.parse(childProcess.execFileSync(
            'git',
            ['show', `${process.env.BEFORE_SHA}:package.json`],
            { encoding: 'utf8' }
          ));

          const parseStrictSemver = (value, label) => {
            const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
            if (!match) {
              throw new Error(`Invalid ${label} version: ${value}`);
            }

            return match.slice(1).map(Number);
          };

          const compareSemver = (left, right) => {
            for (let index = 0; index < left.length; index += 1) {
              if (left[index] !== right[index]) {
                return left[index] - right[index];
              }
            }

            return 0;
          };

          const currentVersion = current.version;
          const previousVersion = previous.version;
          const currentSemver = parseStrictSemver(currentVersion, 'application');
          const previousSemver = parseStrictSemver(previousVersion, 'previous application');
          const versionComparison = compareSemver(currentSemver, previousSemver);

          if (versionComparison < 0) {
            throw new Error(
              `Application version must be greater than the previous version. Previous: ${previousVersion}, current: ${currentVersion}`
            );
          }

          fs.appendFileSync(
            process.env.GITHUB_OUTPUT,
            `changed=${versionComparison > 0}\nversion=${currentVersion}\n`
          );
          '@
          $script | node

      - name: Stop when the application version did not change
        if: steps.version.outputs.changed != 'true'
        shell: pwsh
        run: |
          Write-Output 'No application version bump detected; skipping release.'
          exit 0

      - run: npm ci
        if: steps.version.outputs.changed == 'true'

      - name: Build Windows release
        if: steps.version.outputs.changed == 'true'
        run: npm run dist:win

      - name: Verify release artifact
        if: steps.version.outputs.changed == 'true'
        shell: pwsh
        env:
          VERSION: ${{ steps.version.outputs.version }}
        run: |
          $artifact = "release\AutoRally $env:VERSION.exe"
          if (-not (Test-Path -LiteralPath $artifact -PathType Leaf)) {
            throw "Expected release artifact was not created: $artifact"
          }

      - name: Fail if GitHub release already exists
        if: steps.version.outputs.changed == 'true'
        shell: pwsh
        env:
          GH_TOKEN: ${{ github.token }}
          VERSION: ${{ steps.version.outputs.version }}
        run: |
          $tag = "v$env:VERSION"
          $releaseResponse = (& gh api --include "repos/${{ github.repository }}/releases/tags/$tag" 2>&1 | Out-String).Trim()
          $releaseExitCode = $LASTEXITCODE
          $releaseStatusMatch = [regex]::Match($releaseResponse, 'HTTP/\d+(?:\.\d+)?\s+(\d{3})')
          $releaseStatus = if ($releaseStatusMatch.Success) { [int]$releaseStatusMatch.Groups[1].Value } else { $null }

          if ($releaseExitCode -eq 0) {
            throw "GitHub release already exists: $tag"
          }
          if ($releaseStatus -eq 404) {
            return
          }

          throw "Failed to check for existing GitHub release: $tag`nExit code: $releaseExitCode`nResponse:`n$releaseResponse"

      - name: Fail if release tag already exists
        if: steps.version.outputs.changed == 'true'
        shell: pwsh
        env:
          GH_TOKEN: ${{ github.token }}
          VERSION: ${{ steps.version.outputs.version }}
        run: |
          $tag = "v$env:VERSION"
          $tagResponse = (& gh api --include "repos/${{ github.repository }}/git/ref/tags/$tag" 2>&1 | Out-String).Trim()
          $tagExitCode = $LASTEXITCODE
          $tagStatusMatch = [regex]::Match($tagResponse, 'HTTP/\d+(?:\.\d+)?\s+(\d{3})')
          $tagStatus = if ($tagStatusMatch.Success) { [int]$tagStatusMatch.Groups[1].Value } else { $null }

          if ($tagExitCode -eq 0) {
            throw "Git tag already exists: $tag"
          }
          if ($tagStatus -eq 404) {
            return
          }

          throw "Failed to check for existing Git tag: $tag`nExit code: $tagExitCode`nResponse:`n$tagResponse"

      - name: Publish GitHub release
        if: steps.version.outputs.changed == 'true'
        shell: pwsh
        env:
          GH_TOKEN: ${{ github.token }}
          VERSION: ${{ steps.version.outputs.version }}
        run: |
          $tag = "v$env:VERSION"
          $artifact = "release\AutoRally $env:VERSION.exe"
          gh release create $tag $artifact `
            --repo "${{ github.repository }}" `
            --title "AutoRally $env:VERSION" `
            --generate-notes `
            --target "${{ github.sha }}"
          if ($LASTEXITCODE -ne 0) {
            throw "Failed to publish GitHub release: $tag"
          }
```

The workflow-level concurrency block stays unchanged so pull-request runs still
cancel superseded validations while push workflow runs keep unique groups. The
release job adds its own stable concurrency group with `queue: max` so only
one release publishes at a time and additional versioned pushes wait instead
of canceling or replacing an earlier running or pending publication. The
checkout step keeps full history available for `github.event.before`
comparisons and disables credential persistence; every later release step
still has an explicit `if` guard because a successful "skipping release"
step does not automatically stop later steps in a GitHub Actions job.

- [ ] **Step 3: Validate the workflow structure locally**

Run:

```powershell
git diff --check
node -e "const fs=require('fs'); const text=fs.readFileSync('.github/workflows/ci.yml','utf8'); const checks=[/permissions:\s*\r?\n\s*contents:\s*read/,/release:[\s\S]*?concurrency:\s*\r?\n\s*group:\s*\$\{\{ github\.workflow \}\}-release\s*\r?\n\s*cancel-in-progress:\s*false\s*\r?\n\s*queue:\s*max/,/release:[\s\S]*?permissions:\s*\r?\n\s*contents:\s*write/,/persist-credentials:\s*false/,/cancel-in-progress:\s*\$\{\{ github\.event_name == 'pull_request' \}\}/,/generate-notes/,/npm run dist:win/]; if (!checks.every((pattern)=>pattern.test(text))) process.exit(1)"
```

Expected output: both commands exit successfully with no whitespace errors.

- [ ] **Step 4: Run the local checks affected by the release job**

Run:

```powershell
npm run typecheck
npm run build
```

Expected output: TypeScript typechecking and the production renderer/main
build complete successfully.

- [ ] **Step 5: Review the final diff and commit**

Run:

```powershell
git diff -- .github/workflows/ci.yml docs/superpowers/specs/2026-08-05-github-release-automation-design.md docs/superpowers/plans/2026-08-05-github-release-automation.md
git status --short
```

Commit the workflow plus the matching spec and plan updates together, while
preserving any unrelated user changes such as `package.json`,
`package-lock.json`, or `test-results/.last-run.json`.

Commit:

```powershell
git add .github/workflows/ci.yml docs/superpowers/specs/2026-08-05-github-release-automation-design.md docs/superpowers/plans/2026-08-05-github-release-automation.md
git commit -m "ci: publish GitHub releases for version bumps

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
