# 3606: Prove parity and measure the final reduction

- Status: completed
- Milestone: 36
- Depends on: 3602, 3603, 3604, 3605

## Goal

Run the complete validation and coverage loop, reconcile every removed public
name with ADR-0272, report production/test/documentation line deltas, and judge
whether the milestone genuinely reduced implementation and authoring
complexity.

## Result

The milestone reaches its reduction target without removing a product
capability. Relative to `aeb53cab42c9cb3a8487612d5c7be38add3a37c1`:

| Surface            |                  Baseline |         Final |                Delta |
| ------------------ | ------------------------: | ------------: | -------------------: |
| Production         | 124,818 lines / 711 files | 124,283 / 711 |           -535 lines |
| Core               |  67,327 lines / 349 files |  66,872 / 348 | -455 lines / -1 file |
| Tests              | 132,264 lines / 729 files | 132,048 / 728 | -216 lines / -1 file |
| Public exports     |                     1,718 |         1,716 |                   -2 |
| Declaration output |             833,725 bytes | 831,862 bytes |         -1,863 bytes |

The implementation diff contains 1,035 added and 1,570 deleted production
lines. Test support contains 314 added and 530 deleted lines. Architecture,
issue, plan, package, and website documentation contains 526 additions and 28
deletions. Those additions record the decision and its proof rather than adding
Runtime machinery. Across the complete milestone diff, 1,876 lines were added
and 2,128 deleted, for a net reduction of 252 lines including documentation.

## Public-name reconciliation

ADR-0272 authorized removal of the alternate command-provider bridge. The
removed authoring names are `operationHandler`, `provideOperationHandler`,
`provideOperationTransportBinding`, `schemaMutationHandler`,
`provideSchemaMutationHandler`, `provideSchemaMutationTransportBinding`, and
`pluginSchemaMutationHandlerCapability`, plus their provider-only contracts.
The three removed root Core types are
`PluginOperationContributionCapabilities`,
`PluginOperationHandlerDefinition`, and
`PluginSchemaMutationHandlerDefinition`.

Every supported behavior remains available through
`contributeOperation`, `contributeOperationBinding`,
`contributeSchemaMutation`, and `contributeSchemaMutationBinding`. This keeps
direct and resource handlers, binding-only contributions, capability reads,
protocol codecs, exact instances, conflicts, ownership, privileges, Typegen,
cleanup, direct handles, REST, and GraphQL. Issue 3604 added
`normalizeHttpBrowserBootstrapPath`, producing the net export delta of `-2`.

## Validation

- `yarn typecheck`
- `yarn lint` (no errors; 81 existing line-budget warnings)
- `yarn build`
- `yarn constraints`
- `yarn test` (537 files, 2,555 tests)
- `yarn test:coverage` (91.14% lines, 90.54% statements, 95.75% functions,
  83.97% branches)
- `yarn test:e2e:built` (98 files, 387 tests)
- `yarn test:pack:built` (32 files, 163 tests)
- `yarn website:validate` (17 files, 66 tests)
- `yarn measure:simplification`

## Assessment

The DX improvement is structural rather than cosmetic: plugin authors declare
each command once, five official plugins share one strict option boundary,
browser plugins reuse one HTTP path rule, and Core no longer copies command or
application state between parallel registries. The graph also performs indexed
provider lookup instead of repeated whole-provider scans. The remaining public
surface maps more closely to capabilities that authors actually use.

The next safe reductions should target the remaining line-budget warnings and
large internal modules one issue at a time. Password Auth option normalization
is a candidate only if its current key semantics can be preserved exactly.
Access and Hooks should not share a shell until a common invariant removes more
production code than the abstraction introduces.

## Documentation impact

**Internal engineering documentation.** This issue closes the proof and records
the final measurements. Public contract edits required by the milestone were
already delivered with issues 3601 and 3604; this audit changes no additional
public behavior, configuration, or examples.
