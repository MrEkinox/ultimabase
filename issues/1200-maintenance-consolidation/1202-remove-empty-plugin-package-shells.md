# 1202: Remove empty publishable plugin shells

- Status: completed
- Milestone: 12
- Packages: repository workspaces
- Depends on: 1201
- ADR: ADR-0008, ADR-0009, ADR-0010, ADR-0121

## Goal

Keep planned plugin identities in the backlog without building, testing, or
packaging empty publishable workspaces that expose only `export {}`.

## Acceptance criteria

- [x] The empty `postgres-migrations-plugin`, `server-hono-plugin`, `rest-plugin`, `graphql-plugin`, and `graphql-yoga-plugin` workspace directories are removed.
- [x] Root TypeScript references, package documentation, workspace metadata, and lockfile entries contain no dependency owned only by those empty shells.
- [x] Architecture and roadmap documentation distinguish planned package identities from implemented workspaces.
- [x] Existing transport and migration issues retain the accepted future package names and recreate a package only when implementation starts.
- [x] Build, test, archive, and publish validation enumerate only implemented packages.
- [x] No replacement placeholder, compatibility package, or empty future workspace is introduced.

## Tests

- [x] `yarn install --immutable`, constraints, typecheck, tests, build, and package validation pass without the shells.
- [x] Repository searches prove the removed directories are referenced only as future issue-owned identities where appropriate.

## Validation evidence

- Nine implemented packages remain under `packages/`; Yarn lists no removed plugin workspace.
- The lockfile removed 27 transitive packages and approximately 6.48 MiB owned only by Hono and GraphQL shells.
- Planned package names remain only in architecture, package planning documentation, accepted ADRs, and their implementation issues.
- `yarn install --immutable`, constraints, typecheck, lint, formatting, and build pass.
- Repository unit and type suites pass with 279 files and 1,752 tests.
- Packed-package validation passes with 5 files and 42 tests, and `yarn changeset status` enumerates only implemented workspaces.

## Out of scope

- Implementing migrations, Hono, REST, GraphQL, or Yoga.
- Renaming any accepted future package.
- Removing placeholder application or example documentation.
