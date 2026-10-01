# Milestone 63 final audit — accepted with explicit costs

Date: 2026-10-01. Baseline: `3c130475`. Product revision:
`3a5874d7` (6320), with the retained readonly/selection/item-hover regressions.
No product code is changed by this audit. On 2026-10-02 the user accepted its
explicit costs and deferred debt reduction. [ADR-0286](../../../docs/adr/0286-accept-source-authoring-milestone-costs.md)
records the one-time completion exceptions; original measurements and missed
budgets remain unchanged. Final closure validation passes and the milestone
is completed with explicit exceptions. No push or hosted
CI status is claimed.

## Verdict

The ordinary developer journey is simpler and the source/packed correctness
gates pass. The migration **does not achieve the promised total debt reduction**:
production grows by 3,787 lines, exports by 19, and package declarations by
99,417 bytes. Delivered cold/edit compiler performance is worse than the old
production checkpoint, despite fast warm editor requests.

Keep the improved developer form: the user explicitly accepts those costs.
Do not describe the result as Typegen-free, relationships-only generation,
a net implementation simplification, or a production compiler speed-up.
The historical one-point coverage discrepancy is now resolved by a deterministic
refresh rejection regression. Complexity/performance and historical measurement
findings are accepted exceptions, not corrected budgets. Debt reduction is
deferred; no new implementation is started.

## Capabilities and architecture

The [89-ID ledger](6316-capability-ledger.md) reconciles the ADR-0259 matrix,
prior ADR-0258/0265/0266 removals, and later delivered capabilities. Its
source inventory is paired with runtime/type/conformance and complete built,
JavaScript, PostgreSQL, transport, privilege and security regressions.
It does not claim compatibility with every external community plugin.

The current implementation retains:

- One flat, ordered, identity/instance-aware plugin graph and one compiler.
  Immutable `.use()` records a tuple; it does not compile or register schemas.
- Core-native declaration receipts and optional Plugin Kit helpers with the
  same ownership, privilege, conflict and provenance enforcement.
- One private command graph for application operations and schema mutations.
  Native CRUD, custom fields/codecs, additive patches, private storage,
  capabilities, policy constraints, physical rewrites and events still work.
- Immutable models/queries, nested writes, cross-file/circular string targets,
  virtual results, transaction and mandatory pipeline order, deny/narrow-only
  policy composition and non-forgeable Master authority.
- Existing official plugin behavior, including session rotation, logout
  everywhere, Password changes, Role hierarchy/membership, ACL cleanup,
  Soft Delete modes/restore/purge, and Validation's projected arithmetic.
- JavaScript execution without Typegen. PostgreSQL vector persistence was not
  shipped before this milestone; logical `field.vector` presence/absence is
  preserved, not an implemented persistence feature.

No second name registry, module scope, generated client, schema auto-registration,
ordinary `Schema.use()`, constructor plugin list, ordinary standalone
`Schema.define()`, or native CRUD forwarding through handles remains.
Dynamic/plugin handles remain supported intentionally; they are not the normal
CRUD authoring path. Standalone specialized schemas also remain supported
under ADR-0284, using the same underlying definition machinery.

The milestone includes one explicitly authorized non-typing fix in 6312:
PostgreSQL's speculative upsert insert suppresses a unique collision, then
re-locks **only the declared conflict target**. An unrelated row still fails.
The existing concurrent-upsert failure, stress reproduction and regression
are recorded in 6312; this change must not be called a purely cosmetic migration.

## Complete ordinary authoring comparison

This old-form reconstruction uses the baseline Core and Soft Delete contracts.
It shows the same two schemas, global default/local exception, lifecycle and
commands as the final file; it is not a benchmark or a new supported example.
The active-request context already allowed omission of an application selector
before the milestone. The improvement is therefore not “selectors were always
mandatory”: direct server execution now also resolves the sole active owner.

```ts
import process from 'node:process'

import { Schema, UltimaBase } from '@ultimabase/core'
import { typegenPlugin } from '@ultimabase/typegen'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined) throw new TypeError('DATABASE_URL is required')

export const Post = Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ required: true }),
		published: field.boolean({ default: false }),
	}),
})
export const AuditLog = Schema.define({
	className: 'AuditLog',
	softDelete: false,
	fields: (field) => ({ message: field.string({ required: true }) }),
})

const application = new UltimaBase({
	plugins: [
		typegenPlugin(),
		postgresPlugin({ url: databaseUrl, schemaPolicy: 'override' }),
		softDeletePlugin({ defaultMode: 'explicit' }),
	],
	schemas: [Post, AuditLog],
})

try {
	await application.start()
	const post = await Post.createOne(
		{ data: { title: 'Hello UltimaBase' } },
		{ ultimabase: application },
	)
	await Post.softDelete({ id: post.id }, { ultimabase: application })
	const posts = await Post.findMany(
		{ where: { published: { eq: true } }, limit: 25 },
		{ ultimabase: application },
	)
	console.log(posts[0]?.toJSON())
} finally {
	await application.dispose()
}
```

Final one-file form, copied exactly from the root journey which the
[public-export documentation canary](../../../tooling/documentation/active-contracts.test.ts)
typechecks. Generation remains required before the first TypeScript build for
the retained contracts; installation does not substitute for generation.
This development example's explicit `override` can change the physical schema.

```ts
import process from 'node:process'

import { typegenPlugin } from '@ultimabase/typegen'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined) throw new TypeError('DATABASE_URL is required')

const Blog = UltimaBase.use(typegenPlugin())
	.use(postgresPlugin({ url: databaseUrl, schemaPolicy: 'override' }))
	.use(softDeletePlugin({ defaultMode: 'explicit' }))

export const Post = Blog.Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ required: true }),
		published: field.boolean({ default: false }),
	}),
})

// One local exception; no repeated installation or schema auto-registration.
export const AuditLog = Blog.Schema.define({
	className: 'AuditLog',
	softDelete: false,
	fields: (field) => ({ message: field.string({ required: true }) }),
})

const application = new Blog({ schemas: [Post, AuditLog] })

try {
	await application.start()
	const post = await Post.createOne({ data: { title: 'Hello UltimaBase' } })
	await Post.softDelete({ id: post.id })
	const posts = await Post.findMany({
		where: { published: { eq: true } },
		limit: 25,
	})
	console.log(posts[0]?.toJSON()) // A detached immutable snapshot.
} finally {
	await application.dispose()
}
```

The complete authenticated REST/GraphQL/ACL/Role/Hook/Validation vertical remains
in [minimal](../../../examples/minimal/src/schema.ts) and its
[application construction](../../../examples/minimal/src/create-application.ts).
Those larger examples are maintained and tested, not omitted product features.

| Authoring concern           | Before                                                                                         | Final result / limit                                                                                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin installation         | Separate constructor list after standalone schema definitions.                                 | Chained immutable `UltimaBase.use()` configures the schema factory once.                                                                                                                      |
| Plugin fields/options       | Generated ambient authoring surfaces.                                                          | Installed local receipts infer builders, fields and options from source; absent plugins do not leak those completions.                                                                        |
| Global defaults             | Plugin defaults already supported (including Soft Delete).                                     | Still one default and direct local exceptions. This is not a newly invented capability or a claim that old users repeated every schema option.                                                |
| Schema declaration          | Ordinary `Schema.define({ className, fields, ... })`.                                          | Same object shape through `Blog.Schema.define`; no plugin map or schema `.use()`.                                                                                                             |
| Registration                | Explicit schema list.                                                                          | Same explicit `new Blog({ schemas: [...] })`; declarations never register automatically.                                                                                                      |
| Direct class/model commands | Explicit selector outside an active context; additional handle forwarding.                     | Direct commands use the initialized owner, reject stale/foreign results; no selector or native handle forwarding. Master/context choices remain distinct from owner selection.                |
| Access/Hooks/ACL            | Complete generated contextual schema options.                                                  | Field-local typing is source-owned; exact complete-schema callbacks still use Typegen.                                                                                                        |
| Cross-file relations        | Named generated graph.                                                                         | String targets and same graph retained; no runtime import cycles introduced to infer targets.                                                                                                 |
| Custom User/Role            | Standalone package specializations.                                                            | `PasswordUserSchema.define(Base.Schema, options)` and `RoleSchema.define(Base.Schema, options)`; standalone overloads also remain. Define User before installing the plugin that consumes it. |
| Plugin commands             | Canonical descriptors plus generated signatures.                                               | Same descriptors/handlers, source receipts for configured calls; advanced/dynamic handles still require graph descriptors.                                                                    |
| Plugin author               | Core kernel or Plugin Kit, plus public nominal type references and generated authoring copies. | Return registration receipts from the existing callback; fewer local generated copies, but descriptors, privileges, handlers and global public type references remain.                        |

The [complete small plugin-author before/after](6316-plugin-authoring-comparison.md)
shows the same manifest, option descriptor and registration with only a returned
receipt added. For a plugin author, the concrete packed example
[declares an option and an application export](../../../packages/plugin-kit/tests/e2e/plugin-kit-authoring-language-service.e2e.test.ts);
the [Core-native fixture](../../../packages/core/src/plugins/plugin-source-projections.test-d.ts)
covers field kinds, schema/field options, additive patches, operations and
schema/model mutations without Plugin Kit. The change is to return existing
`fields.register`, `schemas.defineOptions`, `schemas.patch` or `models.extend`
receipts rather than separately reconstruct configured Typegen surfaces.
Existing registrations remain the source of Runtime truth. A complex plugin
is still a security-aware declaration plus executable behavior, not one callback.

## Exact implementation cost

Definitions are frozen in [final metrics](6316-final-metrics.json):
physical non-generated, non-test TypeScript under `packages/*/src`.
This definition includes existing `.test-support.ts` files below `src`;
it is not silently changed to improve the result. Declaration bytes below are
the aggregate built package entrypoints, **not** generated application files.

| Metric                            | Baseline |   Final |           Delta |
| --------------------------------- | -------: | ------: | --------------: |
| Production lines                  |  122,645 | 126,432 | +3,787 (+3.09%) |
| Production files                  |      717 |     729 |             +12 |
| Core lines                        |   67,022 |  70,257 |          +3,235 |
| Core files                        |      358 |     370 |             +12 |
| Test/support lines                |  133,755 | 137,172 |          +3,417 |
| Test/support files                |      744 |     765 |             +21 |
| Public exports                    |    1,720 |   1,739 |             +19 |
| Core public exports               |    1,094 |   1,118 |             +24 |
| Package declaration bytes         |  839,935 | 939,352 |         +99,417 |
| Core declaration bytes            |  592,149 | 668,223 |         +76,074 |
| Typegen production lines          |    3,415 |   3,379 |             −36 |
| Typegen exports                   |       28 |      28 |               0 |
| Typegen package declaration bytes |    9,930 |   9,964 |             +34 |
| Tooling production lines          |    2,371 |   2,366 |              −5 |
| Packages                          |       23 |      23 |               0 |

Production is **5,556 additions / 1,769 deletions across 121 files**.
Core accounts for 85.42% of net production growth. Per-package additions,
deletions and totals are retained in the JSON, including every unchanged package.
No new runtime dependency was added: the two new edges are devDependencies
(Password Auth → vector; Typegen → ACL).

The ten new Core source/projection files contain 1,870 lines; the configured
factory adds 105, for 1,975 physical lines across eleven new files.
This is a subtotal, not the entire Core delta, and the factory contains Runtime
work as well as types. The remaining growth includes generic builder/context
contracts, specialized schemas and direct result ownership. Removing 36 Typegen
implementation lines does not offset that cost.

The final baseline-to-completion patch partition includes all audit artifacts
and the deterministic refresh regression, after formatting. Documentation/evidence
and machine samples are not production code.
This comparison is from the original baseline, not a sum of issue-reported
intermediate diffs or the 1,316 test-proof lines added by revision `3ee12f5e`.

| Patch category                               | Paths |  Added | Deleted |    Net |
| -------------------------------------------- | ----: | -----: | ------: | -----: |
| Production                                   |   121 |  5,556 |   1,769 | +3,787 |
| Tests/support                                |   445 | 11,733 |   8,316 | +3,417 |
| Documentation                                |   144 |  8,928 |   1,752 | +7,176 |
| Generated files                              |     7 |     34 |     196 |   −162 |
| Tooling production                           |     3 |     12 |      17 |     −5 |
| Other (examples/site/scripts/manifests/data) |    44 |  2,689 |     446 | +2,243 |

This partition uses `git diff --no-renames --numstat 3c130475` so moved support
files cannot be mistaken for a production reduction. Documentation means
Markdown/MDX; machine JSON belongs to Other. The audit reports include prior
experiment/checkpoint evidence, not just this turn's work. The new deterministic
refresh regression contributes one test file with 113 lines, included in the
test/support totals, with no product or coverage-configuration change.

## What Typegen actually retains

The [6313 consumer inventory](6313-typegen-inventory.md) remains valid with the
sparse-surface correction from 6320. The generated file is **not just relations**.

| Retained family                                                                    | Why / generation cost for the developer                                                                                                                                                                   |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Named item/output/create/update/nested/select/include/order/relationship contracts | Connect string targets, circular/cross-file names, related values and callback context. Schema/field/name changes still require regeneration for this graph.                                              |
| Every complete `WhereInput`                                                        | Built-ins, custom plugin scalar/codec equality, structural containment, pointers and relations. Source bootstrap is not complete parity. Regenerate when the graph/filter contract changes.               |
| Schema Access, Hooks and ACL contexts                                              | Exact sibling fields, original/persisted items, input and result types require the resolved graph. Local option presence and Runtime semantics are source-owned.                                          |
| Exact Password User results                                                        | Generated `UserItem`, `UserOutput` and `Schemas.User` keep custom fields on `User.findMany()` and authentication results. Custom User shape changes still need generation.                                |
| Standalone specialized builders/options                                            | `PasswordUserSchema.define(options)`, `RoleSchema.define(options)` and low-level `Schema.defineSpecialized()` lack configured receipts. Configured overloads do not erase supported standalone consumers. |
| Advanced operation/mutation/surface maps                                           | Dynamic names, erased source types and named/plugin handles retain operation entries, schema/model maps and canonical mutation descriptors. Configured direct methods do not remove these consumers.      |
| Nominal public value references, enum/object aliases and inert metadata            | Deterministic graph declarations, external value names, fingerprint, stale-output and collision/ownership checks; never runtime executable truth.                                                         |

Removed: four duplicate emitted `Application*Builder` aliases, repeated mutation
definitions, empty generated operation/surface interfaces and empty entries,
and the generated `schemaClass` method copy. Remaining conditional builder
interfaces and schema/model visibility are necessary for inventoried consumers.

For the actual 50-schema file (590,807 bytes), TypeScript AST body attribution is:
42,498 bytes in named WhereInput bodies; 62,693 in shared filters/path operators;
105 in standalone builder/options bodies; 151 in schema-option bodies;
73,457 in operations/surfaces/mutation descriptors; 408,771 in other named
graph/value/input aliases. Bodies total 587,675 bytes; the other 3,132 are
imports/comments/formatting. These are mutually classified **body spans**,
not isolated deletion savings: shared graph aliases serve several consumers.

The User bodies are 657 bytes (`UserItem`), 659 (`UserOutput`) and 1,525
(`Schemas.User`). The whole last contract is used beyond Password Auth;
it is not a 1,525-byte extra authentication-only bridge.

Current tracked artifacts: Todo 59,598 bytes/1,535 lines; minimal
39,696 bytes/1,031 lines. Each retains schema option bodies for Access (50 bytes),
ACL (44), Hooks (48), and PostgreSQL (48); minimal also retains REST (46).
These member-body costs exclude imports/shared types. They exist for retained
standalone/advanced consumers; configured local options do not need their copy.

The 6312 codec-presence experiment failed twice: an inferred parameter defaulted
to `undefined`, then widened to `boolean`; the explicitly annotated custom
Decimal field also erased new capability information. Its valid equality query
became `NullFilter`/TS2769 without the generated contract. This was a fixture
for a community field, **not an official decimal plugin**, and not proof of a
TypeScript impossibility. The user retained all WHERE rather than losing it.

A future model-reference redesign might remove the exact User-result dependency;
a capability-typed codec could improve bootstrap filters. Both require a new
bounded proof and approval. This audit implements neither and adds no second
registry or inference bridge.

## Actual compiler/editor measurements

[Nine fresh raw production samples](6316-final-production-probes.json):
three sequential fresh processes per size, Node 24.20.0 / TypeScript 6.0.3,
built package exports and the current production generator. All have zero
initial diagnostics and exactly one deliberate edit diagnostic. No compiler-host
substitution or competing validation ran during sampling.

| Schemas | Generation median | Cold analysis median (range) | Complete edit diagnostics median (range) | LS initialization median | Peak heap median | Generated bytes |
| ------- | ----------------: | ---------------------------: | ---------------------------------------: | -----------------------: | ---------------: | --------------: |
| 1       |          28.54 ms |        2.432 s (2.427–2.451) |                    0.741 s (0.727–0.755) |                288.30 ms |       504.47 MiB |          16,876 |
| 10      |          47.20 ms |        3.568 s (3.555–3.581) |                    2.012 s (1.984–2.045) |                300.58 ms |       819.62 MiB |         123,167 |
| 50      |          83.27 ms |        8.083 s (8.076–8.096) |                    6.737 s (6.727–6.779) |                371.95 ms |     1,534.73 MiB |         590,807 |

| Schemas | Warm hover p95 median | Warm completion p95 median | Warm diagnostics p95 median |
| ------- | --------------------: | -------------------------: | --------------------------: |
| 1       |               0.61 ms |                    0.83 ms |                    0.048 ms |
| 10      |               0.63 ms |                    0.90 ms |                    0.047 ms |
| 50      |               0.63 ms |                    0.84 ms |                    0.043 ms |

These are language-service requests on an already analyzed program, not total
VS Code UI latency, and not the first hover after every arbitrary edit.
`coldTypecheckDurationMs` is cold analysis; the probe's shorter
`typecheckDurationMs` is a warmed diagnostic pass and must not replace it.
“p95” here is each process's 95th-percentile repeated request latency; the table
takes the median of those three process-level values.

The earlier [actual old/current checkpoint](6316-architecture-stop.md) records
three raw pairs on 50 schemas: cold 5.543 → 8.115 s (+46.40%),
edit 3.755 → 6.806 s (+81.23%), heap 1,169.99 → 1,505.30 MiB (+28.66%),
declarations 661,736 → 622,608 bytes. It precedes 6320; the current artifact is
590,807 bytes. The source User's Access/Hooks/Soft Delete options differ in the
maintained fixtures, so this is a disclosed checkpoint, not a perfectly
feature-identical A/B experiment. Fresh current samples are not mixed into that
older pair to manufacture another controlled regression percentage.

The locked synthetic hybrid suite still passes, but manually substitutes a
reduced registry which omits complete generated WHERE. Its large prototype
speed-ups are **not delivered-production-versus-main speed-ups**.
The compiler gain from the discarded model-flattening candidate is also not
the final result: the user chose expanded readable item hovers instead.

## Runtime and validation

[Existing Runtime scenario](6316-runtime-comparison.json), twenty sequential
lifetimes per revision, one no-product schema/deterministic adapter:

| Median              |   Old production | Final production |
| ------------------- | ---------------: | ---------------: |
| Startup             |         1.036 ms |         0.997 ms |
| Read                |         0.411 ms |         0.429 ms |
| Mutation            |         0.512 ms |         0.516 ms |
| Heap after requests | 10,564,384 bytes | 10,571,776 bytes |

The baseline proof revision has no production changes against `3c130475`.
Its restored comparison checkout was archived recoverably after measurement.
The existing command emits medians only, not individual Runtime samples;
these tiny differences are not a statistical speed-up or a wide-graph promise.

The structural no-product suite checks one assembly, zero absent optional
policy/behavior work, and exactly one read/prepared mutation/executed mutation/
transaction/commit in none/Hooks/Access/both configurations. Core still knows
no concrete policy plugin. It detects insertion of neutral work independently
of machine timing.

Fresh final `yarn validate:full` passes with the required local-network/Docker
permissions from the start: formatting, root typing, ordinary tests, lint,
build/export checks, complete source-mode/PostgreSQL coverage, issue metadata,
constraints and public documentation. Counts: 558 ordinary files/2,657 tests;
637 coverage files/2,921 tests; one issue-metadata file/nine tests;
17 website files/66 tests. Lint has 53 existing warnings and zero errors.
The separately recorded complete built gate passes 102 files/408 tests.
The 2026-10-02 accepted-cost closure full run passes the same final counts:
263.01 s for ordinary tests and 454.13 s for complete coverage. Fresh measurement
reproduces all production/Core/test/export/declaration totals. The third complete
coverage run matches the same counters, all 516 text rows and covered locations,
with unchanged maps and zero losses against the saved raw control.

| Coverage   |  Final counters | Percentage |
| ---------- | --------------: | ---------: |
| Statements | 23,789 / 26,146 |     90.98% |
| Branches   | 14,693 / 17,384 |     84.52% |
| Functions  |   4,999 / 5,202 |     96.09% |
| Lines      | 23,065 / 25,192 |     91.55% |

The pre-correction restored-hover runs and saved successful optimization
candidate had identical covered locations. Core production is byte-identical
to HEAD; the discarded optimization was not the source of the discrepancy.

The [coverage reconciliation](6316-coverage-reconciliation.md) recovers 6320's
complete text table and localizes the point to Password Auth's rejected refresh
compare-and-swap at line 374. The existing concurrent PostgreSQL test permits
both legal outcomes and cannot force this specific interleaving. A deterministic
handler test now forces the failed compare-and-swap, requires the declared
invalid-session error, and prohibits rotation and commit. No production,
threshold, exclusion, or existing concurrency test is changed.

All 516 final text rows exactly match the recovered historical table. Compared
with the saved raw pre-correction report, identical location maps across all
729 production files show only one new covered statement and branch, at lines
374/368, and no loss; the statement restores the missing covered line. The
historical raw map and its exact thread interleaving remain unavailable.
A second complete coverage run passes with identical counters and covered
locations, while hit frequency at the targeted rejection varies from one to two.
The prior failed synthetic timing control (103.987 vs 99.472 ms) remains a recorded failure,
not a pass or a reason to waive any compiler budget.

## Retained limits, individually reviewable

1. Cross-schema named graph remains generated; no relations-only replacement proof.
2. Every complete WHERE remains generated; source bootstrap is deliberately not
   declared equivalent for custom codec/containment inputs.
3. Schema Access/Hooks and ACL sibling-field contexts remain generated.
4. Exact custom Password User results still rely on the graph.
5. Standalone specialized and erased/dynamic advanced consumers retain generated
   builders/options/operations/surfaces; ordinary configured use is source typed.
6. Nested configured plugin options such as `rest.count` retain exact types,
   diagnostics and completion but lose inline JSDoc versus the old generated
   path (6310). Accepted for the milestone, not proof that docs are impossible;
   Core contains no REST-specific knowledge.
7. Exact configured `SchemaResult.update()` hovers expand input internals and
   TypeScript abbreviates the return to `Promise<...>`. Method JSDoc and exact
   result/selection typing remain; selected models and persisted Hook items have
   readable expanded fields, protected against source and packed regressions.
8. Typical ten-schema cold/edit latency is 3.57/2.01 s in this fixture, while
   repeated warm hover/completion is sub-millisecond. Fifty-schema cold/edit and
   memory budgets are still missed; typical size does not erase that result.
9. All three total complexity ceilings are missed; plugin-author DX gains are
   narrower than application-consumer DX gains.
10. Machine-sensitive synthetic timing remains a limitation: the earlier failed
    control is recorded, not converted into a pass by later green runs. The
    historical coverage discrepancy is separately resolved, not waived.

## Findings and next decisions

| Finding                                                                           | Disposition                                                                                                                                                                                              |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complexity ceilings: production <122,645; exports <1,720; declarations ≤839,935.  | Original ceilings failed; user explicitly accepts their one-time cost exception under ADR-0286 and defers reduction. Actual metrics stay visible.                                                        |
| Historical real-production compiler budgets (+10% cold/edit, +15% heap).          | Original checkpoint failed; user accepts the explicit ADR-0286 exception, with disclosed fixture comparability limits and hover-first choice. No threshold change.                                       |
| Historical one-point covered-location discrepancy.                                | Closed by the deterministic refresh regression: all 516 recovered historical table rows match; the raw control comparison has the expected one statement/branch gain and zero losses.                    |
| Full original before/after distributions for every required metric.               | Partial and explicitly accepted under ADR-0286: nine fresh current TS samples, six historical TS samples, paired Runtime medians; old 1/10 production and individual Runtime samples remain unavailable. |
| Four issue handoffs had prose iterations without tables.                          | Corrected by retrospective tables preserving recorded failures, corrections and checks, without inventing runs or changing historical status.                                                            |
| Historical capability descriptions included removed destructive/arbitrary powers. | Ledger explicitly attributes those earlier removals to ADR-0259, not this migration.                                                                                                                     |

Potential later reductions, **not implemented** here:

- Make the internal source/graph boundary coherent so ordinary source schemas do
  not keep recomputing structures already known by the retained graph. Prove one
  vertical first; stop after two equivalent failures.
- Reduce duplicated contextual builder/option projections and specialized
  User/Role plumbing, with current source/packed parity tests as the gate.
- Cache immutable per-application model-mutation names instead of rebuilding a
  schema-wide Map/Set for every result binding; benchmark larger result graphs,
  preserving stale-owner security and descriptor/cycle semantics.
- Remove further generated standalone/advanced duplication only after identifying
  and replacing an actual consumer; configured overloads alone are not removal.

Documentation impact is internal engineering documentation: this audit updates
evidence, issue handoff formatting and plan/checklist truth, not product behavior.
Existing public pages remain accurate and their complete gate passes. Work is
limited to audit evidence, already-authorized editor/type regressions, and the
deterministic security regression for the identified coverage finding.
Milestone 63 is completed with explicit costs under ADR-0286 and the passing
final validation. The dedicated local completion commit contains this audit
and the retained regressions. No push or debt-reduction task is authorized.
