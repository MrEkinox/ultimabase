# Milestone 31 — residual complexity inventory

- Recorded: 2026-09-21
- Source revision: `265b54c909404f9690a666bdf39ace01ccee466e`
- Status: refreshed by 3101; private cleanup and direct compilation delivered through 3106
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
audit loop. The three public protocol decisions below were explicitly accepted in 3107 on
2026-09-21; the old R-001–R-010 removal list was not used as authorization. Keep milestone 30's final
[contract matrix](2026-09-20-architecture-contract-matrix.md) unchanged and record
milestone 31 decision deltas here, with accepted ADR, exact public difference,
retained invariant, regression evidence and delivered issue.

| ID    | Candidate                                        | Initial evidence and important limit                                                                                    | Planned issue | Decision/delivery                                               |
| ----- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------- |
| RC-01 | Private dead helpers                             | 14 functions, 304 declaration-body lines; no caller found and no package-root export                                    | 3102–3104     | Core/Access/Hooks delivered (3102–3104)                         |
| RC-02 | Hooks field-path duplication                     | 143-line file duplicates Core's public types; private resolver has only its own test and differs in field-map selection | 3104          | Delivered by 3104; public type/editor parity verified           |
| RC-03 | Canonical compiler IR round trip                 | Live internal machinery, 21 production files/3,648 lines; originally motivated by replacement compilation               | 3105–3106     | ADR-0263 accepted in 3105; direct compilation delivered by 3106 |
| RC-04 | Runtime normalization/commit stage contributions | No current production caller of runtimePipelineStage; ordinary interceptors are used                                    | 3107–3108     | ADR-0264 delivered by 3108; -223 production lines               |
| RC-05 | Typegen emitter marker                           | One production provider; availability consumed by conditional-privilege fixtures; no generation dispatcher              | 3107/3109     | ADR-0265 delivered by 3109; -42 production lines                |
| RC-06 | Migration anticipation                           | Planning has a real testing consumer; no shipped migration plugin executes this path                                    | 3107/3110     | ADR-0266 delivered by 3110; -445 production lines               |

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
| Core    | resolvePluginTargetSchema                | `declaration-targets.ts` (3101 source)                                                               |    26 |
| Core    | resolvePluginTargetField                 | `declaration-targets.ts` (3101 source)                                                               |    25 |
| Core    | normalizePluginFieldPath                 | `declaration-targets.ts` (3101 source)                                                               |    24 |
| Core    | compareDecimalValues                     | [decimal.ts](../../packages/core/src/schema/fields/builtins/decimal.ts)                              |    15 |
| Core    | readPluginFieldKindTarget                | `declaration-targets.ts` (3101 source)                                                               |    13 |
| Core    | executeSchemaFieldsCallback              | [field-builder.ts](../../packages/core/src/schema/schema/field-builder.ts)                           |    13 |
| Core    | normalizeContributedSchemaIndex          | [indexes.ts](../../packages/core/src/schema/schema/indexes.ts)                                       |    13 |
| Core    | createPluginFieldKindTarget              | `declaration-targets.ts` (3101 source)                                                               |    10 |
| Core    | replaceNamedNode                         | `canonical-state.ts` (3101 source)                                                                   |     8 |
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

Hooks field paths (`packages/hooks-plugin/src/authoring/field-paths.ts` at 3101)
and [Core field paths](../../packages/core/src/schema/fields/paths.ts) repeat
the type recursion for SchemaFieldPath and FieldAtPath. Core already exports
these types and Hooks already depends on Core.

The private Hooks resolver reads schema.fields; Core's resolver reads
schema.persistedFields. No Hooks production caller was found, only its own
test. Preserve current Hooks root exports and editor behavior while removing
the unused runtime implementation; do not substitute live resolvers blindly.

## RC-03: live compiler machinery requires a design decision

Before 3106, [compileSchemaDeclarations](../../packages/core/src/plugins/compiled-schema-declarations.ts)
encoded input, invoked the canonical compiler, validated output and decoded it
through a private artifact session. The direct implementation now keeps prepared
domain objects, frozen selection results and mandatory final validation.
[ADR-0196](../adr/0196-callback-free-schema-compiler-ir.md) records the original
public compiler boundary.

The original IR avoided exposing executable artifacts to a replacement compiler.
ADR-0259 removed replacement, but current compilation still needs selection
facts, field/schema identity, option ownership and command-surface derivation.
Do not remove the directory or validation wholesale. Issue 3105 maps each
retained invariant to the proposed direct internal path before user approval.
[ADR-0263](../adr/0263-direct-private-schema-compilation.md) now records that
concrete flow, consumer migration and required regressions. The user accepted it on 2026-09-21.
It includes the explicitly accepted removal of accidental selector access to
private opaque-option markers, verified through a built public-package probe;
portable matching and opaque presence/absence remain. The direct path is delivered by 3106 with no additional public delta.

## RC-04: keep used Runtime integrations

The former `runtimePipelineStage` factory (`packages/core/src/runtime/pipeline/definitions.ts`
at commit `adbefbad`) contributes handlers only to normalization and commit. Collection/composition
lives in
[create-framework-engine.ts](../../packages/core/src/runtime/application/create-framework-engine.ts).
Tests exercise this API, but no official production producer was found.

ACL does use provideRuntimeInterceptor with preparedOperation. Ordinary
normalization, transactions, beforeCommit/afterCommit, callback attribution and
all used interceptors remain. The accepted removal targets only the unused
stage-contribution branch, not C-035 as a whole. Accepted
[ADR-0264](../adr/0264-remove-unused-runtime-stage-contributions.md) lists the
five public exports and exact retained Runtime contracts; approved 2026-09-21, not yet implemented.

## RC-05: a marker has observable semantics

[Typegen's setup](../../packages/typegen/src/plugin.ts) directly generates and
writes declarations. The inert
[typegenEmitterCapability](../../packages/core/src/plugins/capability-token.ts)
has no production generation dispatcher. The 3107 audit corrected the initial
"no reader" claim: optional requirements in Core and open-kernel fixtures use
its availability to condition `typegen:reference`. Those are actual engineering
consumers; generic single-provider conflicts and inspection also have effects.

Removing it also removes its specific public require/inspection and
single-provider conflict and conditional-privilege conventions. Those deltas and
fixture adaptations are explicitly accepted in
[ADR-0265](../adr/0265-remove-typegen-emitter-marker.md).
Typegen generation, timing, fingerprints, current options and remaining
generic capability checks stay intact. No replacement marker is proposed.

## RC-06: distinguish future migration support from actual persistence

`planAdapterMigrations` (former `packages/core/src/runtime/adapters/migration.ts` at `21094201`)
is consumed by
`FakeAdapterMigrationHistory` (former `packages/testing/src/adapters/fake-migration-history.ts` at `21094201`).
PostgreSQL declares migration contribution and schema-preparation capabilities,
but currently only test fixtures provide the migration/preparation paths; the
migration plugin itself is future backlog, not a shipped package.

This is not "no consumer": issue 3107 resolved the testing API exception and
provenance/snapshot boundary explicitly. Keep existing
PostgreSQL synchronization, physical schema contributions, owner-private
password/session records, ownership checks and raw-driver lease safety. Future
migration issues may need updated assumptions after an accepted removal; they
do not become authorized implementation work. Accepted
[ADR-0266](../adr/0266-defer-migration-only-protocols.md) lists the exact
exports, privilege, metadata and used testing API exception. It retains every
physical snapshot field, live `renamedFrom` synchronization, private storage
and the generic conformance harness. The testing API exception was accepted
on 2026-09-21; removal remains the separate 3110 implementation.

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

| Candidate | Current owner/consumer evidence                                                                                                                                       | Required preservation and regression proof                                                                                                    | Public/site impact and decision                                                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RC-01     | Core/Access/Hooks; no callers for the initial functions, reader wrappers or isolated declaration-target module                                                        | Existing schema/declaration, option normalization and provider tests; identical source/built/packed exports                                   | Internal cleanup only; website Access/Hooks/Core contracts remain accurate; Core/Access/Hooks delivered by 3102–3104                                                          |
| RC-02     | Hooks duplicates Core public types; private Hooks resolver is used only by field-paths.test.ts                                                                        | Source and built type/language-service checks; nested path validity/depth and documented field-map distinction                                | Hooks root names retained; consolidation delivered by 3104                                                                                                                    |
| RC-03     | SchemaDeclarationRegistry and compileCommandGraph consume canonical compiler output; selectors and option/provenance checks are live                                  | Complete compilation, malformed-declaration, atomic publication, Soft Delete patch, Typegen and transport suites                              | ADR-0263 delivered by 3106; invariants verified and affected website page updated                                                                                             |
| RC-04     | Core factory/tests/root exports only; ACL separately uses provideRuntimeInterceptor/preparedOperation                                                                 | Runtime order, transactions/rollback, attribution, ACL and no-product performance counters                                                    | ADR-0264 delivered in 3108; Runtime/plugin-authoring guidance updated with the exact removal                                                                                  |
| RC-05     | Typegen directly generates/writes; conditional-privilege fixtures consume marker availability; generic single-provider checks apply                                   | Startup ordering, deterministic declarations/fingerprints, generated-project and editor tests                                                 | ADR-0265 delivered by 3109; automatic generation retained and public guidance updated                                                                                         |
| RC-06     | planAdapterMigrations -> FakeAdapterMigrationHistory -> tests/e2e/open-kernel-proof.e2e.test.ts; PostgreSQL migration metadata/preparation providers are fixture-only | Resolve that real testing use explicitly; preserve current sync policies, physical contributions, private storage, raw leases and attribution | ADR-0266 public/engineering exception accepted in 3107, including P-016 adapterMigrationCapability; PostgreSQL/testing/plugin-authoring guidance follows exact accepted scope |

Later decision issues record each accepted ADR/retention outcome here, and
implementation issues add actual removals and preserved regression evidence.
RC-01 Core cleanup is delivered in 3102: 334 production lines removed, including
the isolated declaration-target module and exclusive helpers/imports. All 63
retained definitions in the six surviving files are unchanged, all removed
function bodies were unexecuted in the full baseline, and source/type tests
plus 33 packed scenarios pass. All 23 public roots retain identical exports
and declaration hashes. No public difference or ADR is required. Access RC-01 cleanup is delivered by 3103: -100 production lines. Its three
obsolete helper self-tests are replaced by three current-path regression cases
(+35 test lines), with unchanged public declarations and green source/packed/
PostgreSQL conformance. Full coverage comparison against 3101 finds no retained
location regression. Hooks RC-01/RC-02 are delivered by 3104: -164 production lines; ten remaining
declarations are identical, current-path/editor tests preserve behavior, and
2,780 coverage plus 38 built/PostgreSQL tests pass. All 1,726 export names remain;
only Hooks declaration text changes to reuse Core types (-2,244 bytes overall).
No retained coverage location regresses. The three public protocol decisions in 3107 remain pending.

### Additional private orphan noticed during 3104

Core's `resolveSchemaFieldPath` and its exclusive `hasChildFields` helper in
`packages/core/src/schema/fields/paths.ts` have no remaining caller after removal
of declaration-targets.ts in 3102. The initial name scan was obscured by Hooks'
separate resolver with the same name. The Core file still owns used public
`SchemaFieldPath`/`FieldAtPath` types, which must remain. Core source is unchanged
in 3104. The user approved this bounded cleanup at the 3105 stop. Deliver it in a
separate audited 3102 follow-up commit before 3106; preserve the public types.
The follow-up is now delivered: -61 production lines, with identical retained
types/JSDoc and built Core declarations. Both deleted function bodies were
unexecuted in the 3104 full coverage; 382 focused and two built tests pass.

### RC-03 delivery in 3106

Direct private compilation removes 2,256 production lines. The old 21-file /
3,639-line IR directory becomes seven files / 1,368 lines; required provenance,
nominal membership, ordering, completeness and publication checks remain.
The artifact/session transport, IDs, encoder/decoder, format-only validation
and exclusive self-tests are gone, with live scenarios moved to the current
boundary. No new public API replaces them. The only public delta is the
explicitly accepted removal of opaque marker matching.

All 1,726 exports and callable declarations remain. The final 2,795 coverage
tests and 384 built/packed/PostgreSQL tests pass, including the unchanged
committed Typegen output/fingerprint. Retained coverage locations, including
the moved provenance validator, have no regression. Current production is
124,178 lines / Core 66,129; tests/support 130,979; tooling 2,119.
The public plugin-authoring page, Core README, schema examples and architecture
are updated. RC-04/05/06 still require the separate decisions in 3107.

## 3107 accepted decisions

The user accepted RC-04, RC-05 and RC-06 after separate presentation on
2026-09-21. ADR-0264/0265/0266 own the exact removal scopes, retained invariants
and engineering exceptions. Earlier pending statements above describe the
3104/3106 checkpoints. No public implementation is removed by 3107 itself.

### RC-04 delivery in 3108

The approved normalization/commit stage factory, four authoring types, private
registry and assembly branches are removed: -223 production lines. Core keeps
normalization, commit, all logical interceptors, exact ownership/privileges,
ACL prepared operations, Hook transaction callbacks and post-commit events.
No replacement API appears. Only the two factory-exclusive test files retire;
assembly invariants and negative source/packed export checks remain covered.

All 2,793 coverage tests and 384 built/packed/PostgreSQL tests pass. Comparison
with 3106 checks 681 unchanged maps and 456 retained locations, plus the changed
branch audit; no retained coverage loss. Public exports decrease exactly from
1,726 to 1,721 and other packages' declarations are byte-identical. Core and
plugin-authoring website guidance follow the removal. RC-05/06 remain approved
for the separate 3109/3110 implementation and commit gates.

### RC-05 delivery in 3109

The emitter token/interface, Typegen provider/tuple and marker fixtures are
removed: -42 production lines. Workflow/value proofs register their existing
public references under an explicit privilege without a generator marker;
generic conditional privileges, cardinality, requirements and denial checks
remain unchanged. Core no longer designates an emitter; duplicate official
plugin identities still fail. Setup generation, file writes, options and
fingerprints are unchanged, including committed generated examples.

All 2,550 source/type tests, 384 built/packed/PostgreSQL tests and 2,794 coverage
tests pass. Coverage comparison checks 682 unchanged maps and 121 mapped
locations with no retained loss; unmapped locations are marker-only. Exports
fall exactly from 1,721 to 1,719; only Core and Typegen declarations change.
Public Typegen/plugin-authoring guidance and both READMEs follow the approved
retirement. RC-06 alone remains for the 3110 implementation gate.

### RC-06 delivery in 3110

ADR-0266 is implemented: retire only the migration support/intent/planner,
exclusive equality helper, privilege, PostgreSQL migration/preparation tokens,
upgrade helper and metadata field, and the expressly approved public testing
history helper. No migration replacement or storage format is introduced.
Core physical snapshots/materialization remain intact; PostgreSQL follows its
existing explicit policy, including direct `renamedFrom`. Current SQL, desired
state, private data, leases and ownership remain protected by unchanged
implementation and real database tests. Future 513–515 retain their dependency
chain and require an integration decision before implementation.

Exactly 14 package-root export names disappear (Core 9, PostgreSQL 4, testing 1),
leaving 1,705 with no additions; the other 20 declarations are byte-identical.
Production decreases by 445 lines, tests/support by 322. Source tests: 2,533;
built/packed/PostgreSQL: 384; full coverage: 2,777. No retained coverage loss
across 675 identical maps and 466 mapped retained locations; changed guards and
removed migration-only branches are manually reconciled. The website and
engineering contracts change in the same issue. See the complete
[3110 handoff](../../issues/3100-residual-complexity-simplification/3110-remove-unused-migration-anticipation.md).
All six candidates are resolved; 3111 and 3112 own the final audits.
