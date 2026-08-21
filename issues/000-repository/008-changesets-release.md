# 008: Configure Changesets and prereleases

- Status: completed
- Milestone: 0
- Packages: repository
- Depends on: 001, 003, 007
- ADR: ADR-0016

## Goal

Prepare independent package changelogs and npm prereleases.

## Acceptance criteria

- [x] Changesets configuration matches the `@ultimabase` scope.
- [x] Fundamental package versions can be kept aligned.
- [x] A `next` prerelease workflow is documented.
- [x] GitHub publication supports npm provenance.

## Tests

- [x] Run a dry-run version and package operation without publishing.

## Implementation notes

- Changesets publishes scoped packages publicly and keeps the six foundational packages in one fixed version group. Official plugins retain independent versions and changelogs.
- Pushes to `main` create or update a version pull request. npm publication requires an explicit manual workflow dispatch through the `npm` GitHub environment.
- The publication job supports npm trusted publishing through OIDC and provenance. An optional granular `NPM_TOKEN` only bootstraps package names that do not exist on npm yet.
- The `next` process uses a dedicated release branch so prerelease mode never blocks stable development on `main`.
- A temporary repository copy verified that one `shared` patch aligns all six foundational packages at `0.0.1`, generates per-package changelogs, builds every package, and dry-runs every Yarn archive without publishing.
