# Milestone 63: Source-typed application authoring

- Status: in-progress
- Issues: 6301, 6302, 6303, 6304, 6305, 6306, 6307, 6308, 6309, 6310, 6311, 6312, 6317, 6318, 6314, 6313, 6315, 6316

Replace plugin-generated authoring surfaces with one source-typed configured
application factory while preserving every current UltimaBase capability and
retaining Typegen as the sole named cross-schema graph. The approved target is
frozen in the
[DX contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md).

## Baseline

- Revision: `3c130475`
- Production: 122,645 lines in 717 files
- Core: 67,022 lines in 358 files
- Tests: 133,755 lines in 744 files
- Public exports: 1,720
- Aggregate package declarations: 839,935 bytes
- Typegen: 3,415 production lines in 25 files, 28 public exports, 9,930
  declaration bytes

## Execution order

- [x] [6301: Prove source inference and lock DX budgets](6301-source-inference-proof-and-budgets.md)
- [x] [6302: Accept the configured source-typed application ADR](6302-source-typed-application-adr.md)
- [x] [6303: Make plugin installation an immutable application factory](6303-immutable-configured-application-factory.md)
- [x] [6304: Preserve exact schema contracts from source](6304-source-typed-schema-contracts.md)
- [x] [6305: Project plugin authoring types from source](6305-plugin-source-type-projections.md)
- [x] [6306: Bind direct class execution to the sole active application](6306-direct-class-application-binding.md)
- [x] [6307: Migrate Access, Hooks, and Validation source typing](6307-official-plugin-source-typing.md)
- [x] [6308: Migrate ACL, Roles, and Password Auth source typing](6308-auth-policy-plugin-source-typing.md)
- [x] [6309: Migrate Soft Delete, vector, and PostgreSQL source typing](6309-data-plugin-source-typing.md)
- [x] [6310: Migrate HTTP, Hono, and REST configured installation](6310-http-rest-plugin-migration.md)
- [x] [6311: Migrate the GraphQL stack to configured installation](6311-graphql-stack-migration.md)
- [x] [6312: Migrate Plugin Kit, testing, and community conformance](6312-plugin-author-conformance.md)
- [x] [6317: Migrate plugin installation consumers](6317-migrate-plugin-installation-consumers.md)
- [ ] [6318: Migrate schema authoring consumers](6318-migrate-schema-authoring-consumers.md)
- [ ] [6314: Remove superseded authoring and application paths](6314-remove-superseded-authoring-paths.md)
- [ ] [6313: Reduce Typegen to its retained graph boundary](6313-reduce-typegen-to-schema-graph.md)
- [ ] [6315: Publish one canonical authoring journey](6315-canonical-authoring-migration.md)
- [ ] [6316: Audit parity, DX, complexity, and TypeScript cost](6316-final-parity-and-complexity-audit.md)

Issues are sequential because each removes the previous implementation only
after its replacement proves the same capability and editor behavior. No issue
may retain a compatibility alias merely to make the next issue easier.
The user approved executing 6314 before 6313 after the 6313 inventory proved
that generated plugin projections still type 6314's old authoring paths.
The user then approved splitting the broad 6314 consumer migration into 6317
and 6318 before the final 6314 removal gate.

## Mandatory execution loop

Every issue follows the complete loop in the
[DX and audit contract](../../docs/plans/2026-09-28-source-typed-application-authoring-target.md#mandatory-issue-audit-loop):

```text
baseline → implementation → focused validation → yarn validate:full
→ complete diff audit → corrections → invalidated validation
→ complete re-audit → zero findings → dedicated local commit
→ committed-diff inspection
```

A failed, skipped, interrupted, flaky, or unavailable required check prevents
completion. Passing tests never replaces the diff audit, and a green diff audit
never excuses a failed test. A later issue cannot start before the previous
issue has zero findings, complete validation, an accurate handoff, and its
reviewed dedicated commit.

## Milestone exit criteria

- The canonical application is configured through chained
  `UltimaBase.use(plugin())` calls and instantiated with explicit schemas.
- Application schemas use the unchanged `App.Schema.define({ className,
fields, ... })` declaration shape; no public `Schema.use()` exists.
- Plugins are installed once at application scope and expose direct schema
  options for local configuration or exceptions.
- Schema classes and immutable returned models expose every current applicable
  command directly through the sole active application, without an ordinary
  explicit application argument.
- Source and packed TypeScript contracts retain exact completion, signature,
  and diagnostic behavior. The user accepted the missing inline JSDoc on
  nested configured plugin-option hover for this milestone; issue 6316 must
  review that and every other retained limitation separately.
- `@ultimabase/typegen` remains the sole application-specific cross-schema name
  authority. Source-derivable plugin surfaces no longer require generated
  declarations or author-maintained Typegen descriptors; accepted exact
  callback and Password User-result exceptions remain for the final audit.
- JavaScript, privilege, lifecycle, ownership, Runtime, transport, database,
  Access, Hooks, validation, authentication, roles, ACL, soft-delete, vector,
  plugin-instance, and community-plugin capabilities remain.
- The locked TypeScript latency and memory budgets pass.
- Total production lines and public exports decrease, aggregate package
  declaration bytes do not increase, and no duplicate internal bridge remains.
- `yarn validate:full` passes with no coverage loss.
- The final audit compares the old and new forms with exact measurements.

If any stop condition from the approved DX contract occurs, mark the active
issue blocked and request architecture review instead of widening the design.

Issue 6301 reached that stop because a source-module scope cannot retain exact
circular relationship typing inside Access filters and Hook inputs without a
TypeScript initializer cycle. The user approved retaining the existing Typegen
graph exclusively for that name-resolution boundary. The milestone is active
again; plugin-added surfaces must now prove direct source inference without a
second registry.

## Preparation audit

| Iteration | Finding or evidence                                                                                                                                                                                                                                                        | Correction or decision                                                                                                                                                                                                                                                                                                | Validation result                                                                                                                                                                                                                 | Remaining findings                        |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1         | The initial plan had issue-specific tests but did not embed the mandatory audit/correction/commit loop in every issue. The planning commit was also created before that review.                                                                                            | Added one central nine-step loop, an explicit audit-and-commit gate to every issue, hard failure semantics, committed-diff inspection, and amendment rather than another planning commit.                                                                                                                             | Resolved; covered by final iteration 5 validation.                                                                                                                                                                                | None                                      |
| 2         | The approved example used `Blog.Schema.define`, but portable and package-specialized schema preservation was not assigned one canonical mechanism. Keeping standalone `Schema.define` unchanged would silently preserve a second ordinary compiler.                        | Defined `UltimaBase` as the zero-plugin configured factory, retained the single `Name.Schema.define` rule, and made compatible reuse and specialized-schema proof an issue-6301 stop gate.                                                                                                                            | Resolved; metadata, dependency, link, and consistency checks pass.                                                                                                                                                                | None                                      |
| 3         | One issue originally migrated every official plugin, and the first Core issues removed old forms before downstream consumers could migrate. That was too broad to audit and encouraged either red intermediate commits or a permanent bridge.                              | Split migration into six bounded capability verticals. Allowed only temporary delegation to the same internal implementation, named issue 6314 as mandatory removal owner, and made duplicated migration internals a stop.                                                                                            | Resolved; all 16 issue scopes and their continuous dependency chain pass the structural audit.                                                                                                                                    | None                                      |
| 4         | The initial performance plan omitted Typegen regeneration/edit-to-diagnostic cost, and the final audit did not explicitly promise the complete one-file form requested for divergence review.                                                                              | Added old/new generation and edit-to-diagnostic measurements. Required issue 6316 to render the complete final one-file form after the milestone audit and compare it with the frozen target.                                                                                                                         | Resolved; the proof and final-audit criteria now cover both requirements.                                                                                                                                                         | None                                      |
| 5         | The complete preparation diff exposed a stale 6301–6310 plan index and the first sandboxed full-validation run could not open required local Hono/Yoga listeners.                                                                                                          | Updated the index to 6301–6316, included every new file in the diff audit, identified the exact `listen EPERM` environment cause, and reran the unchanged full gate with local-listener permission.                                                                                                                   | `yarn validate:full` passed: 549/549 ordinary files and 2,600/2,600 tests; 624/624 coverage files and 2,848/2,848 tests; 90.91% statements, 84.48% branches, 96.07% functions, 91.47% lines; website 17/17 files and 66/66 tests. | None; audit closed.                       |
| 6         | The frozen runnable example attempted to persist `field.vector()` through PostgreSQL, while the current pg-vector package deliberately ships only a logical field contract and GraphQL codec. Issue 6309 also named unshipped vector ordering and physical representation. | After architecture review, the user kept physical PostgreSQL vector persistence for later. The runnable example no longer persists a vector; issues 6301 and 6309 now prove conditional `field.vector()` presence, exact current typing, absence diagnostics, and static compilation without expanding product scope. | `yarn validate:full` passed: 549/549 ordinary files and 2,600/2,600 tests; 624/624 coverage files and 2,848/2,848 tests; 90.91% statements, 84.49% branches, 96.07% functions, 91.47% lines; website 17/17 files and 66/66 tests. | None; corrected preparation audit closed. |
