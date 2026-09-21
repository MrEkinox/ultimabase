# Milestone 31 — residual complexity inventory

- Recorded: 2026-09-21
- Source revision: `265b54c909404f9690a666bdf39ace01ccee466e`
- Status: refreshed by 3101 at 1f04e5e3; no removal delivered by milestone 31
- Owner: [issue 3101](../../issues/3100-residual-complexity-simplification/3101-baseline-and-consumer-inventory.md)
- Execution rules: [plan](2026-09-21-residual-complexity-simplification.md)
- Measured baseline and retained IDs: [3101 baseline](2026-09-21-residual-complexity-baseline.md)

## Evidence and decision rules

The initial audit combined identifier/reference searches with source and built
package-root export checks, production/test/example consumers and targeted
comparison of implementations. It is a starting inventory, not an exhaustive
proof of whole-program reachability. Issue 3101 refreshed this evidence at
the actual implementation baseline and recorded the exact validation commands.

Every row remains retained until its implementation issue has completed the
audit loop. The public contract decisions below are pending; none is authorized
by the old R-001–R-010 removal list. Keep milestone 30's final
[contract matrix](2026-09-20-architecture-contract-matrix.md) unchanged and record
milestone 31 decision deltas here, with accepted ADR, exact public difference,
retained invariant, regression evidence and delivered issue.

| ID    | Candidate                                        | Initial evidence and important limit                                                                                    | Planned issue | Decision/delivery                                                            |
| ----- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------- |
| RC-01 | Private dead helpers                             | 14 functions, 304 declaration-body lines; no caller found and no package-root export                                    | 3102–3104     | Internal cleanup proposed; not delivered                                     |
| RC-02 | Hooks field-path duplication                     | 143-line file duplicates Core's public types; private resolver has only its own test and differs in field-map selection | 3104          | Internal consolidation proposed; type/editor parity required                 |
| RC-03 | Canonical compiler IR round trip                 | Live internal machinery, 21 production files/3,648 lines; originally motivated by replacement compilation               | 3105–3106     | Architecture decision pending; directory size is not removable-line estimate |
| RC-04 | Runtime normalization/commit stage contributions | No current production caller of runtimePipelineStage; ordinary interceptors are used                                    | 3107–3108     | Public decision pending; retain used C-035 behavior                          |
| RC-05 | Typegen emitter marker                           | One provider, no reader found; generic single-provider conflict and inspection effects remain                           | 3107/3109     | Public decision pending; reopen C-039 explicitly                             |
| RC-06 | Migration anticipation                           | Planning has a real testing consumer; no shipped migration plugin executes this path                                    | 3107/3110     | Public/engineering decision pending; reopen exact P-016/C-023/C-026 scope    |

## RC-01 exact private-function inventory

These counts are physical lines of the declarations, not expected commit
deletions. Comments, imports, the two dead registries and reader wrappers are
not additional measured savings yet. Core contributes 238 lines, Access 56 and
Hooks 10. Registry examples below overlap this table and must not be double
counted.

| Package | Symbol                                   | Source                                                                                               | Lines |
| ------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----: |
| Core    | matchesSelector                          | [schema-selectors.ts](../../packages/core/src/plugins/schema-selectors.ts)                           |    50 |
| Core    | normalizeOwnerReference                  | [schema-field-patch-operations.ts](../../packages/core/src/plugins/schema-field-patch-operations.ts) |    41 |
| Core    | resolvePluginTargetSchema                | [declaration-targets.ts](../../packages/core/src/plugins/declaration-targets.ts)                     |    26 |
| Core    | resolvePluginTargetField                 | [declaration-targets.ts](../../packages/core/src/plugins/declaration-targets.ts)                     |    25 |
| Core    | normalizePluginFieldPath                 | [declaration-targets.ts](../../packages/core/src/plugins/declaration-targets.ts)                     |    24 |
| Core    | compareDecimalValues                     | [decimal.ts](../../packages/core/src/schema/fields/builtins/decimal.ts)                              |    15 |
| Core    | readPluginFieldKindTarget                | [declaration-targets.ts](../../packages/core/src/plugins/declaration-targets.ts)                     |    13 |
| Core    | executeSchemaFieldsCallback              | [field-builder.ts](../../packages/core/src/schema/schema/field-builder.ts)                           |    13 |
| Core    | normalizeContributedSchemaIndex          | [indexes.ts](../../packages/core/src/schema/schema/indexes.ts)                                       |    13 |
| Core    | createPluginFieldKindTarget              | [declaration-targets.ts](../../packages/core/src/plugins/declaration-targets.ts)                     |    10 |
| Core    | replaceNamedNode                         | [canonical-state.ts](../../packages/core/src/plugins/schema-compiler-ir/canonical-state.ts)          |     8 |
| Access  | normalizeRelationFieldAccessDeclarations | [field-declarations.ts](../../packages/access-plugin/src/authoring/field-declarations.ts)            |    44 |
| Access  | declareSchemaAccess                      | [declarations.ts](../../packages/access-plugin/src/authoring/declarations.ts)                        |    12 |
| Hooks   | declareSchemaHooks                       | [declarations.ts](../../packages/hooks-plugin/src/authoring/declarations.ts)                         |    10 |

Access's schemaAccessDeclarations and Hooks' schemaHookDeclarations are private
WeakMaps whose writer/reader wrappers have no current caller. The actual option
and provider normalization paths remain.

The 3101 refresh corrects the initial claim that runPluginDeclarationFactory
was live. Its four-line declaration fell below the initial five-line scan
threshold, and declaration-targets.ts has no importing module at all. No built
package root exports the helper. The whole private module is an RC-01 cleanup
candidate; the initial fourteen-function/304-line count excludes this additional
helper and its exclusive types/state. This is a corrected reachability finding,
not a public-capability removal or a claim of exhaustive dead-code detection.

Access splitFieldAccessOptions has its own test and is outside the 14-function
count. Issue 3103 must distinguish obsolete implementation testing from any
scenario that still protects the live option path.

## RC-02: reuse existing Core types

[Hooks field paths](../../packages/hooks-plugin/src/authoring/field-paths.ts)
and [Core field paths](../../packages/core/src/schema/fields/paths.ts) repeat
the type recursion for SchemaFieldPath and FieldAtPath. Core already exports
these types and Hooks already depends on Core.

The private Hooks resolver reads schema.fields; Core's resolver reads
schema.persistedFields. No Hooks production caller was found, only its own
test. Preserve current Hooks root exports and editor behavior while removing
the unused runtime implementation; do not substitute live resolvers blindly.

## RC-03: live compiler machinery requires a design decision

[compileSchemaDeclarations](../../packages/core/src/plugins/compiled-schema-declarations.ts)
encodes the input, invokes the canonical compiler, validates the output and
decodes it through a private artifact session.
[ADR-0196](../adr/0196-callback-free-schema-compiler-ir.md) records the original
public compiler boundary.

The original IR avoided exposing executable artifacts to a replacement compiler.
ADR-0259 removed replacement, but current compilation still needs selection
facts, field/schema identity, option ownership and command-surface derivation.
Do not remove the directory or validation wholesale. Issue 3105 maps each
retained invariant to the proposed direct internal path before user approval.

## RC-04: keep used Runtime integrations

[runtimePipelineStage](../../packages/core/src/runtime/pipeline/definitions.ts)
contributes handlers only to normalization and commit. Collection/composition
lives in
[create-framework-engine.ts](../../packages/core/src/runtime/application/create-framework-engine.ts).
Tests exercise this API, but no official production producer was found.

ACL does use provideRuntimeInterceptor with preparedOperation. Ordinary
normalization, transactions, beforeCommit/afterCommit, callback attribution and
all used interceptors remain. The proposed removal targets only the unused
stage-contribution branch, not C-035 as a whole.

## RC-05: a marker has observable semantics

[Typegen's setup](../../packages/typegen/src/plugin.ts) directly generates and
writes declarations. The inert
[typegenEmitterCapability](../../packages/core/src/plugins/capability-token.ts)
has a provider but no reader in the current repository.

Removing it also removes its specific public require/inspection and
single-provider conflict convention. That delta must be accepted explicitly.
Typegen generation, timing, fingerprints, current options and remaining
generic capability checks stay intact. No replacement marker is proposed.

## RC-06: distinguish future migration support from actual persistence

[planAdapterMigrations](../../packages/core/src/runtime/adapters/migration.ts)
is consumed by
[FakeAdapterMigrationHistory](../../packages/testing/src/adapters/fake-migration-history.ts).
PostgreSQL declares migration contribution and schema-preparation capabilities,
but currently only test fixtures provide the migration/preparation paths; the
migration plugin itself is future backlog, not a shipped package.

This is not "no consumer": issue 3107 must resolve the testing contract and every
provenance/snapshot dependency before proposing exact deletions. Keep existing
PostgreSQL synchronization, physical schema contributions, owner-private
password/session records, ownership checks and raw-driver lease safety. Future
migration issues may need updated assumptions after an accepted removal; they
do not become authorized implementation work.

## Rejected shortcuts

- GraphQL normalization is used by handwritten generated-execution.ts. A
  filename containing "generated" does not make production code generated or
  unused.
- pgVectorPlugin is a public product factory with tested behavior; missing
  calls in other production modules is not evidence that its product is unused.
- Moving a small test-used helper into fixtures is not automatically a net
  complexity reduction.
- The generic Runtime interceptor protocol has a real ACL consumer.
- Existing selective CI already avoids repeating ordinary unit suites when
  full coverage runs. Instrumented-source and built/packed integration runs
  protect different boundaries.
- Required provenance, private storage, monotonic policy and lifecycle checks
  must not be removed because an adjacent future migration API is unused.

## Decision and delivery ledger

Issue 3101 refreshed references across tracked source, tests, applications,
initializer templates and examples, and resolved exports from all 23 canonical
built package entries. The initial 14 functions remain unused and non-public.
The additional declaration-target helper correction is recorded above. No
namespace or dynamic import of its module was found. The AST scan is a discovery
aid, not a proof of exhaustive dead-code detection or external community usage.

| Candidate | Current owner/consumer evidence                                                                                                                                       | Required preservation and regression proof                                                                                                    | Public/site impact and decision                                                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RC-01     | Core/Access/Hooks; no callers for the initial functions, reader wrappers or isolated declaration-target module                                                        | Existing schema/declaration, option normalization and provider tests; identical source/built/packed exports                                   | Internal cleanup only; website Access/Hooks/Core contracts remain accurate; no removal delivered                                                                   |
| RC-02     | Hooks duplicates Core public types; private Hooks resolver is used only by field-paths.test.ts                                                                        | Source and built type/language-service checks; nested path validity/depth and documented field-map distinction                                | Keep Hooks root names; no new public abstraction; no removal delivered                                                                                             |
| RC-03     | SchemaDeclarationRegistry and compileCommandGraph consume canonical compiler output; selectors and option/provenance checks are live                                  | Complete compilation, malformed-declaration, atomic publication, Soft Delete patch, Typegen and transport suites                              | Architecture decision pending in 3105; review Core/schema and plugin-authoring website pages                                                                       |
| RC-04     | Core factory/tests/root exports only; ACL separately uses provideRuntimeInterceptor/preparedOperation                                                                 | Runtime order, transactions/rollback, attribution, ACL and no-product performance counters                                                    | Public decision pending in 3107; Runtime/plugin-authoring guidance must follow any approved removal                                                                |
| RC-05     | Typegen provides an inert marker but setup directly calls generation/writing; generic single-provider checks still apply                                              | Startup ordering, deterministic declarations/fingerprints, generated-project and editor tests                                                 | Public uniqueness/inspection change pending in 3107; Typegen/plugin-authoring documentation reviewed in 3109                                                       |
| RC-06     | planAdapterMigrations -> FakeAdapterMigrationHistory -> tests/e2e/open-kernel-proof.e2e.test.ts; PostgreSQL migration metadata/preparation providers are fixture-only | Resolve that real testing use explicitly; preserve current sync policies, physical contributions, private storage, raw leases and attribution | Public/engineering decision pending in 3107, including P-016 adapterMigrationCapability; PostgreSQL/testing/plugin-authoring guidance follows exact accepted scope |

Later decision issues record each accepted ADR/retention outcome here, and
implementation issues add actual removals and preserved regression evidence.
No row is delivered yet; all public decisions remain pending.
