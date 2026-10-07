# 6311: Migrate the GraphQL stack to configured installation

- Status: completed
- Milestone: 63
- Packages: `@ultimabase/graphql-plugin`, `@ultimabase/graphql-http`, `@ultimabase/graphql-yoga-plugin`, `@ultimabase/graphiql-plugin`, `@ultimabase/apollo-sandbox-plugin`
- Depends on: 6310
- ADR: ADR-0279
- Execution contract: [milestone 63 DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md)

## Goal

Move GraphQL schema projection, HTTP execution, Yoga, and explorer providers to
the configured application factory while preserving their sibling-transport
boundary and complete GraphQL behavior.

## Baseline inventory

- Starting revision: `95c185b8`; the worktree was clean and `main` was eleven
  commits ahead of `origin/main`. No push is authorized.
- GraphQL Core owns the direct `graphql` exposure option, generated and custom
  schema composition, selected operation and schema-mutation bindings, request
  limits, networkless execution, and one application capability. Its option
  registrar still returns `undefined`, and tests still supply manual generated
  option augmentation.
- Yoga mounts that capability only through HTTP and publishes the neutral
  `graphql-http` endpoint; GraphiQL and Apollo Sandbox consume that endpoint
  and HTTP routes without installing GraphQL, HTTP, Yoga, or a server.
- The minimal example and initializer currently install GraphQL after schema
  declaration, so their direct `graphql` options cannot be source typed.

## Acceptance criteria

- [x] Every GraphQL package installs through the same flat `UltimaBase.use()` chain with exact dependencies, peers, instances, order, privileges, claims, and lifecycle.
- [x] GraphQL Core remains network-independent; GraphQL HTTP, Yoga, GraphiQL, and Apollo Sandbox meet only through the optional HTTP capability boundary.
- [x] Schema, CRUD, relations, nested writes, plugin operations, authentication context, selection, errors, nullability, custom fields, and naming retain their current behavior.
- [x] GraphQL and REST remain sibling normalizers into the same Runtime operation/query path without direct SQL or transport-specific authorization.
- [x] Yoga and explorer providers retain configuration, ownership, endpoint, browser-origin, development-mode, lifecycle, and post-shutdown semantics.
- [x] Source and packed types expose exact configured options and plugin-owned application/schema operation projections without generated plugin declarations.
- [x] Superseded installation consumers and Typegen descriptors are removed rather than bridged per package.
- [x] Package READMEs, examples, initializer, and public documentation are updated.
- [x] Documentation impact is recorded.

## Tests

- [x] Existing unit, type, editor, GraphQL, HTTP, Yoga, explorer, source-mode, packed, security, and PostgreSQL E2E suites migrate without dropped assertions.
- [x] REST/GraphQL parity and common-Runtime-path regressions.
- [x] Locked TypeScript and Runtime performance budgets.
- [x] `yarn validate:full` before the issue is completed.

## Audit and commit gate

- [x] Record the starting revision and inventory every GraphQL projection, operation, resolver boundary, HTTP capability, provider, explorer, lifecycle, security, and documentation contract.
- [x] Audit the complete diff for network coupling in GraphQL Core, transport divergence, authorization bypass, schema or nullability drift, provider ownership leaks, lifecycle regressions, package-specific bridges, stale Typegen, and documentation drift.
- [x] Record each finding and correction in the handoff; rerun affected GraphQL/HTTP/security verticals plus the complete sibling-transport audit until no finding remains.
- [x] Any failed, skipped, interrupted, flaky, or unavailable required check keeps the issue `in-progress`; a passing schema snapshot cannot replace Runtime and transport evidence.
- [x] Complete every acceptance/test checkbox, locked performance gate, and exactly one Documentation impact classification before setting `completed`.
- [x] Create one dedicated local commit only after `yarn validate:full` and the audit are green; inspect its complete diff and line categories, amend/re-audit if needed, and do not push.

## Out of scope

- New GraphQL fields, transport protocols, or explorer providers.
- Moving HTTP or Yoga dependencies into GraphQL Core.
- A separate GraphQL application builder.

## Audit loop and handoff

| Iteration | Finding                                                                                                                             | Correction and evidence                                                                                                                                                                                                                                                                                                                 | Remaining finding |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 1         | The existing GraphQL option registrar returned `undefined`, requiring a generated option augmentation even on a configured factory. | Return the existing authorized `defineOptions` receipt and project it on `GraphqlPlugin`; source and packed editor tests prove presence, absence on an unrelated factory, exact `count: true` hover, completion, and invalid-value diagnostics.                                                                                         | None.             |
| 2         | The minimal example and initializer installed GraphQL after schema declaration.                                                     | Move the same configured plugin and exact operation allowlists into their schema factories; extend that flat chain with Yoga, HTTP, server, database, and security plugins. Preserve explicit schema registration. The packed initializer, minimal application, GraphQL/REST parity, authentication, Yoga, and explorer E2E tests pass. | None.             |
| 3         | The first full validation stopped at formatting of the new benchmark evidence.                                                      | Format that document and rerun the complete gate; the stopped run was not counted as passing.                                                                                                                                                                                                                                           | None.             |
| 4         | The first passing full gate showed branch coverage at 84.36%, below issue 6310's 84.37%.                                            | Add malformed JavaScript option tests for `graphql`, `operations`, and `bulk` being `null`; rerun the full gate. Final branch coverage is 84.38%, with all other percentages preserved or improved.                                                                                                                                     | None.             |
| 5         | `yarn validate:full` does not include the complete built-E2E project.                                                               | Run `yarn test:e2e:built` separately: 101 files and 405 tests pass.                                                                                                                                                                                                                                                                     | None.             |

GraphQL Core still imports no HTTP, Yoga, REST, authentication, or database
provider. Its schema compilation, resolvers, custom schema composition,
nullability, request limits, and networkless application capability did not
change. Yoga still consumes that capability only through HTTP; the explorers
still consume the provider-neutral endpoint. No transport received Core
authority or direct persistence access, and no new bridge or public API was
added. Runtime request handling, plugin identity and order, privileges,
lifecycle, and post-shutdown behavior remain on their existing paths. The
minimal application's operation allowlists are identical; only their
installation position in the same flat chain changed. The complete GraphQL,
HTTP, REST, security, PostgreSQL, and packed E2E suites provide parity evidence.

The `graphql` option's Typegen descriptor is now `false` and the regenerated
minimal declaration contains no `GraphqlSchemaExposureOption` import or
generated `graphql` option. Its runtime normalization remains registered.
GraphQL source/packed authoring now needs no generated plugin declaration;
Typegen continues to own the one accepted cross-schema name graph. Package
tests that still exercise the old constructor `plugins` parameter remain
assigned to issue 6314's repository-wide removal, as with issue 6310; they
are not a second production installation path. The configured nested-option
QuickInfo still lacks the old generated JSDoc, the accepted documentation-only
limit recorded for issue 6316. No plugin-specific Core workaround was added.

Final `yarn validate:full` passed: 557 ordinary files/2,647 tests, 635
coverage files/2,908 tests, and 17 website files/66 tests, with zero type or
lint errors. Coverage is 90.86% statements (23,880/26,280), 84.38% branches
(14,764/17,496), 96.04% functions (5,022/5,229), and 91.43% lines
(23,154/25,322). The 1/10/50-schema TypeScript benchmark passed twice; its
measured samples and comparison are in
[`evidence/6311-graphql-benchmark.md`](evidence/6311-graphql-benchmark.md).
The ordinary Runtime performance suite and all complete built E2E passed.

Documentation impact: `both`. The GraphQL and Yoga package READMEs, minimal
example, initializer README, and public GraphQL guide now show installation
before schema declaration. The GraphQL HTTP, GraphiQL, and Apollo Sandbox
READMEs were reviewed; their neutral endpoint and provider contracts did not
change, so no edits were needed there. No schema example under Core changed
because this issue did not modify Core schema behavior or inference.

No implementation exceeds the issue's original acceptance criteria. No push
is authorized.

The staged production TypeScript changes add 45 lines and remove 43; tests add
236 and remove 265, while generated declarations add 21 and remove 25. The
overall net increase comes from the issue audit, benchmark record, plan, and
public documentation, not a new Runtime layer.
