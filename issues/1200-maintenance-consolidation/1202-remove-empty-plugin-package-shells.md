# 1202: Remove empty publishable plugin shells

- Status: ready
- Milestone: 12
- Packages: repository workspaces
- Depends on: 1201
- ADR: ADR-0008, ADR-0009, ADR-0010, ADR-0121

## Goal

Keep planned plugin identities in the backlog without building, testing, or
packaging empty publishable workspaces that expose only `export {}`.

## Acceptance criteria

- [ ] The empty `postgres-migrations-plugin`, `server-hono-plugin`, `rest-plugin`, `graphql-plugin`, and `graphql-yoga-plugin` workspace directories are removed.
- [ ] Root TypeScript references, package documentation, workspace metadata, and lockfile entries contain no dependency owned only by those empty shells.
- [ ] Architecture and roadmap documentation distinguish planned package identities from implemented workspaces.
- [ ] Existing transport and migration issues retain the accepted future package names and recreate a package only when implementation starts.
- [ ] Build, test, archive, and publish validation enumerate only implemented packages.
- [ ] No replacement placeholder, compatibility package, or empty future workspace is introduced.

## Tests

- [ ] `yarn install --immutable`, constraints, typecheck, tests, build, and package validation pass without the shells.
- [ ] Repository searches prove the removed directories are referenced only as future issue-owned identities where appropriate.

## Out of scope

- Implementing migrations, Hono, REST, GraphQL, or Yoga.
- Renaming any accepted future package.
- Removing placeholder application or example documentation.
