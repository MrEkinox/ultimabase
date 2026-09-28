# 6311: Migrate the GraphQL stack to configured installation

- Status: planned
- Milestone: 63
- Packages: `@ultimabase/graphql-plugin`, `@ultimabase/graphql-http`, `@ultimabase/graphql-yoga-plugin`, `@ultimabase/graphiql-plugin`, `@ultimabase/apollo-sandbox-plugin`
- Depends on: 6310
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Move GraphQL schema projection, HTTP execution, Yoga, and explorer providers to
the configured application factory while preserving their sibling-transport
boundary and complete GraphQL behavior.

## Acceptance criteria

- [ ] Every GraphQL package installs through the same flat `UltimaBase.use()` chain with exact dependencies, peers, instances, order, privileges, claims, and lifecycle.
- [ ] GraphQL Core remains network-independent; GraphQL HTTP, Yoga, GraphiQL, and Apollo Sandbox meet only through the optional HTTP capability boundary.
- [ ] Schema, CRUD, relations, nested writes, plugin operations, authentication context, selection, errors, nullability, custom fields, and naming retain their current behavior.
- [ ] GraphQL and REST remain sibling normalizers into the same Runtime operation/query path without direct SQL or transport-specific authorization.
- [ ] Yoga and explorer providers retain configuration, ownership, endpoint, browser-origin, development-mode, lifecycle, and post-shutdown semantics.
- [ ] Source and packed types expose exact configured options and plugin-owned application/schema operation projections without generated plugin declarations.
- [ ] Superseded installation consumers and Typegen descriptors are removed rather than bridged per package.
- [ ] Package READMEs, examples, initializer, and public documentation are updated.
- [ ] Documentation impact is recorded.

## Tests

- [ ] Existing unit, type, editor, GraphQL, HTTP, Yoga, explorer, source-mode, packed, security, and PostgreSQL E2E suites migrate without dropped assertions.
- [ ] REST/GraphQL parity and common-Runtime-path regressions.
- [ ] Locked TypeScript and Runtime performance budgets.
- [ ] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [ ] Record the starting revision and inventory every GraphQL projection, operation, resolver boundary, HTTP capability, provider, explorer, lifecycle, security, and documentation contract.
- [ ] Audit the complete diff for network coupling in GraphQL Core, transport divergence, authorization bypass, schema or nullability drift, provider ownership leaks, lifecycle regressions, package-specific bridges, stale Typegen, and documentation drift.
- [ ] Record each finding and correction in the handoff; rerun affected GraphQL/HTTP/security verticals plus the complete sibling-transport audit until no finding remains.
- [ ] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; a passing schema snapshot cannot replace Runtime and transport evidence.
- [ ] Complete every acceptance/test checkbox, locked performance gate, and exactly one Documentation impact classification before setting `completed`.
- [ ] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- New GraphQL fields, transport protocols, or explorer providers.
- Moving HTTP or Yoga dependencies into GraphQL Core.
- A separate GraphQL application builder.
