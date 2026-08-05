# GitHub Release Automation Design

## Goal

When a version bump is merged to `main`, GitHub Actions should validate the
repository, build the Windows portable AutoRally executable, and publish a
GitHub release containing that executable.

## Design

Extend the existing `.github/workflows/ci.yml` workflow with a release job:

- Run the release job only for pushes to `main` where `package.json` changes
  the application version compared with the previous commit.
- Require the existing `quality` and `e2e` jobs to pass before releasing.
- Run on `windows-latest`, because the configured release target is a Windows
  portable executable.
- Keep the workflow-level permission at `contents: read`, and grant only the
  `release` job `contents: write`.
- Preserve the existing workflow-level concurrency behavior: pull-request runs
  still share a cancelable per-PR group, while push runs keep unique workflow
  groups and are not canceled or replaced.
- Add job-level concurrency to serialize release publication with a stable
  release group, `cancel-in-progress: false`, and `queue: max`, so only one
  release publication is active at a time. Because push validations stay
  independent and are retained, closely spaced version bumps are not
  guaranteed to publish in strict chronological order.
- Check out the repository with `persist-credentials: false` in the `quality`,
  `e2e`, and `release` jobs, keep `fetch-depth: 0` on the release checkout,
  then install Node.js 22 dependencies with `npm ci` and run `npm run dist:win`.
- Read the version from `package.json`, create release tag `vVERSION`, and
  publish a GitHub release with automatically generated notes based on merged
  pull requests and commits, plus the matching
  `release/AutoRally VERSION.exe` artifact.
- Fail rather than silently overwrite an existing tag or release.

The existing CI jobs and their commands remain unchanged. The release job is
additive and does not alter pull-request behavior.

## Data Flow and Failure Handling

The push event supplies the commit being released. A version comparison
guards the release job so ordinary pushes do not create releases. The release
job remains downstream of `quality` and `e2e`, and its own stable concurrency
group makes release publication mutually exclusive. Because push workflow runs
keep unique groups and are not canceled, closely spaced version bumps can
finish validation in either order, so the workflow does not guarantee strict
chronological publication ordering. Build or test failures stop the release
through job dependencies. Missing artifacts, invalid versions, or an existing
release tag cause an explicit workflow failure rather than a
successful-looking release. Release notes use GitHub's generated-notes
support; this automation does not maintain a repository `CHANGELOG.md`.

## Validation

- Validate the workflow syntax and expressions using the repository's existing
  CI conventions, including the workflow-level and release-job concurrency
  rules.
- Confirm the version comparison matches only application version changes.
- Confirm the release asset path is produced by `npm run dist:win`.
- Run the local typecheck and production build after the workflow change.
