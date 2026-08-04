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
- Check out the commit, install Node.js 22 dependencies with `npm ci`, and run
  `npm run dist:win`.
- Read the version from `package.json`, create release tag `vVERSION`, and
  publish a generated GitHub release with the matching
  `release/AutoRally VERSION.exe` artifact.
- Grant the workflow `contents: write` permission, while keeping pull-request
  validation read-only through job-level conditions.
- Fail rather than silently overwrite an existing tag or release.

The existing CI jobs and their commands remain unchanged. The release job is
additive and does not alter pull-request behavior.

## Data Flow and Failure Handling

The push event supplies the commit being released. A path/version comparison
guards the release job so ordinary pushes do not create releases. Build or
test failures stop the release through job dependencies. Missing artifacts,
invalid versions, or an existing release tag cause an explicit workflow
failure rather than a successful-looking release.

## Validation

- Validate the workflow syntax and expressions using the repository's existing
  CI conventions.
- Confirm the version comparison matches only application version changes.
- Confirm the release asset path is produced by `npm run dist:win`.
- Run the local typecheck and production build after the workflow change.
