# 3009: Migrate application operations to the canonical graph

- Status: planned
- Milestone: 30
- Packages: `@ultimabase/core`, `@ultimabase/password-auth-plugin`, `@ultimabase/plugin-kit`
- Depends on: 3008
- ADR: decision from issue 3003

## Goal

Run current plugin application operations, led by Password Auth, through the
canonical command graph without changing their public TypeScript or Runtime
behavior.

## Acceptance criteria

- [ ] Operation declaration, payload snapshot, handler ownership, public errors,
      result materialization, cancellation, request context, and transaction
      behavior read one canonical compiled command.
- [ ] Password Auth signup, login, refresh, logout, session resolution, readable
      User results, and class convenience methods retain their current contracts.
- [ ] Username/password-only login and schema-derived signup inputs remain
      distinct through direct TypeScript, REST, and GraphQL.
- [ ] Owner-private credentials and sessions remain inaccessible to Query,
      Typegen, generated CRUD, Access, Hooks, and foreign plugins.
- [ ] Legacy operation declarations may remain only as a temporary adapter into
      the canonical graph and may not retain a second Runtime registry.

## Tests

- [ ] Password Auth source and packed editor tests, JavaScript, private storage,
      session, REST, GraphQL, PostgreSQL, authorization, safe-error, rollback,
      and cancellation suites pass.
- [ ] Core operation ownership, lifecycle, typecheck, lint, build, and
      constraints pass.

## Audit gate

- [ ] Audit Password Auth and generic application operations for duplicate
      registration, changed inputs, user disclosure, leaked credentials, and
      alternate execution. Correct and repeat the full audit until green.
- [ ] Record behavior, line, file, test, duration, and Documentation impact
      evidence before completion.

## Out of scope

- Schema mutations, Typegen projection cleanup, and REST or GraphQL planner
  deletion.
