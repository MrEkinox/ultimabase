# Current plan: Source-typed application authoring

- Status: in-progress
- Milestone: 63
- Baseline: `3c130475`
- Completed issues: 6301, 6302, 6303, 6304, 6305, 6306, 6307, 6308, 6309, 6310, 6311, 6312, 6317, 6318, 6314
- Active issue: none; issue 6314 is complete
- Next issue: 6313

Issue 6314 resumed from clean revision `33ea7809` after the user's approval on
2026-10-01. The ordinary duplicate schema commands and migration-only public
application selector are removed; dynamic/advanced handles remain. The full
validation, two complete built E2E passes, locked TypeScript benchmark, and
diff audit pass. Its issue handoff records exact intermediate code metrics and
the remaining final-milestone ceilings. No push is authorized.

Current checkpoint: issue 6318 is complete. Executable ordinary schema consumers
across the repository, starter, examples, and website now use `App.Schema.define()` or the portable
`UltimaBase.Schema.define()`. The standalone ordinary `Schema.define()` method
is removed; `Schema.is()` and `Schema.defineSpecialized()` remain. The first
permission-correct `yarn validate:full` initially exposed migration-related
lint errors; the final full run passed 557 ordinary files/2,650 tests and 636
coverage files/2,912 tests. The complete built E2E passes 102 files/406 tests
after regenerating both committed example declarations and updating two packed
hover expectations. The `SchemaResult.update()` hover-verbosity change is
recorded for issue 6316. Issue 6318's dedicated local commit records this
checkpoint; no push is authorized. Earlier progress notes follow for history.

Issue 6318's first 23-file Query probe was reverted after a focused typecheck
showed old Runtime-negative fixtures rejected earlier and one direct internal
normalizer fixture incompatible with the exact configured AST. The same group
has now been migrated in smaller verified batches. Public
`QueryBuilder.include()` retains its typed target callback and Runtime identity
check; the direct internal normalizer test explicitly exercises its Runtime
boundary without widening the API. Core executable authoring calls have been
migrated, and its ordinary suite passes (273 files, 1,383 tests). Validation,
pg-vector, Roles, and Soft Delete package suites also pass; Soft Delete's built
E2E suite passes (4 files, 19 tests). Continue with remaining packages, prose,
website, examples, old API removal, and full validation. ACL's exact
sibling-field callback typing is a newly exposed blocker: a bounded
`App.Schema.define()` test yielded `unknown` for local `data.title` and
`data.visibility` with both builder and direct field declarations. The failing
probe was reverted; the ACL package typecheck and ordinary suite pass. ADR-0280
already retains complete-schema Access/Hooks callbacks in Typegen after failed
source inference, but ACL was classified as source-typed. Its exact callback
test uses a test-only augmentation; Typegen emits no ACL descriptor today.
The user approved the existing Typegen fallback on 2026-10-01. ADR-0283
refines ADR-0280 without a second graph: ACL's option remains available from
source, while Typegen emits one public descriptor for exact sibling-field
callbacks. The generated source-editor proof passes, and the package-local
type fixture now represents the pre-generation contract. Continue issue 6318;
do not retry the same inference class. No local 6318 commit or push exists.

Issue 6318's PostgreSQL pass exposed a source bootstrap mismatch for custom
field `contains`: Runtime accepts developer input `{ code }` and normalizes it
to an internal `{ partial }` operand, but source typing mistakenly used that
normalized result as the input. ADR-0281 already retains exact complete
`WhereInput` in Typegen, so the pre-generation source type now advertises the
operator with an unknown operand. The unchanged valid Runtime input and the
generated containment editor test pass; no cast or new graph was added.
Continue PostgreSQL and remaining consumers. Full validation is pending.

The user approved reordering issues 6314 and 6313 on 2026-09-30. Issue 6314
first removes old application handle paths that consume generated plugin
projections, after issue 6318 removes standalone `Schema.define()`. Issue 6313
then removes only projections proven superseded, preserving the named schema graph and
every complete generated `WhereInput`. The earlier 6313 deletion experiment
was fully reverted before this dependency correction.

Issue 6314's first bounded probe changed 386 calls in 133 Core files and was
also fully reverted. TypeScript exposed several distinct old-contract test
classes, not a mechanical spelling migration. The user approved splitting
consumer migration into issue 6317 (constructor plugin installation), issue
6318 (standalone schema authoring), then issue 6314 (remaining handles and
selectors). Issue 6313 follows those removals. Do not retry the broad codemod.

The user approved a bounded variadic `UltimaBase.use(...plugins)` extension
for issue 6317. ADR-0282 records that decision without rewriting ADR-0279.
The fixed-tuple and dynamic-list proof passed root typecheck, focused Runtime
tests, build, and the locked 1/10/50-schema TypeScript benchmark. The
constructor plugin option has now been removed and repository consumers have
been migrated. Complete validation, built E2E, locked budgets, diff audit, and
the issue handoff pass. Its dedicated local commit records this checkpoint; no
push is authorized.

Replace plugin-generated authoring surfaces with the user-approved configured
application factory and source-typed plugin contract while retaining Typegen as
the sole cross-schema name graph and, under ADR-0281, all complete schema
`WhereInput` declarations. The exact target is frozen in the
[DX contract](docs/plans/2026-09-28-source-typed-application-authoring-target.md):
plugins install only through `UltimaBase.use()`, schemas retain the current
`App.Schema.define({ className, fields, ... })` form, registration stays
explicit, direct class commands resolve the sole active application, plugin
surfaces infer from source, while complete `where` typing and exact
cross-schema resolution remain generated for this milestone.

The current logical `pg-vector` field remains source typed only on factories
that install `pgVectorPlugin()`. Milestone 63 does not add physical PostgreSQL
vector persistence; its proof covers conditional builder presence, inference,
hover, diagnostics, and static compilation only.

Issue 6301 is a mandatory evidence gate. It locks compiler, language-service,
memory, hover, diagnostic, and complexity budgets before any production public
API migration. If the proof requires another installation path, a permanent
bridge, duplicated plugin contracts, capability loss, or unacceptable
TypeScript cost, stop for architecture review.

Issues run in the milestone execution order with one dedicated commit and complete
`yarn validate:full` evidence per issue. The milestone ends with an exact
old-versus-new audit of DX, capabilities, lines, exports, declarations,
TypeScript cost, Runtime cost, tests, and coverage.

Every issue must execute the saved mandatory loop: baseline, scoped
implementation, focused validation, `yarn validate:full`, complete diff audit,
correction, invalidated validation, complete re-audit, and zero findings before
its dedicated commit. Any failed, skipped, interrupted, flaky, or unavailable
required test keeps the issue `in-progress`; passing tests alone never replaces
the audit. Inspect the committed diff and amend the unpushed issue commit if a
post-commit finding appears. Do not advance or push with an unresolved finding.

The final issue-6316 milestone audit must include the complete one-file
developer form and compare it with the saved target so any syntax or capability
divergence is visible before milestone acceptance.

Issue 6301 started from revision `afd4c8b4` and reached an architecture stop.
The configured factory can type sibling Access/Hooks callbacks and expose
`field.vector()` only after `pgVectorPlugin()` is installed. However, an
individually declared schema class cannot recover the exact target item behind
the current string relationship target without an external name-to-schema type
registry. Lazy class targets recover one-way precision but mutually recursive
inferred declarations fail with TypeScript's circular-initializer diagnostics.
The user resolved that stop by accepting one application-local, source-only
schema type scope. It is attached once to the configured factory, preserves the
existing `App.Schema.define({ className, fields, ... })` and string-target
forms, performs no Runtime import or registration, and leaves `new App({
schemas: [...] })` authoritative. The complete callback proof invalidated that
candidate before any production change.

Exact Access relationship filters and exact Hook/nested-mutation inputs force the
source module's name-to-schema map to be evaluated while the mutually
referencing schema constants are still being inferred. TypeScript 6.0.3 then
reports TS7022 and TS2615. Indexing the module directly by export name avoids
the compiler cycle, but incorrectly requires every export identifier to equal
its Runtime `className`; UltimaBase currently supports different names and the
repository relies on that capability. The active issue and milestone therefore
require the existing generated graph.

The user approved the capability-safe boundary: Typegen remains the sole
authority for named cross-schema resolution and circular relationships. Source
types own plugin-added field builders, options, methods, mutations, operations,
and other local projections, so plugin authors no longer maintain parallel
Typegen declarations for those surfaces. No source schema registry coexists
with Typegen. Other generated schema contracts remain unchanged until the
milestone evidence identifies which are genuinely superseded; their possible
removal is a later decision rather than an assumption. Issue 6301 completed
the conservative proof from revision `afd4c8b4`; issue 6302 is the resume point
for the architecture decision. No production export changed and no push is
authorized.

Issue 6307 established the narrower ADR-0280 exception after bounded compiler
proof: field Access, field Hooks, Validation, ACL, and other locally decidable
options remain source typed, while schema `access` and `hooks` keep structured
Typegen descriptors. Their complete items, filters, relationships, operations,
and plugin mutation keys depend on the same retained application graph. The
failed source-only marker branch is removed; no second registry or weakened
callback contract is retained.

Issue 6302 accepted ADR-0279 from revision `3ee12f5e`. The decision locks one
immutable `UltimaBase.use()` chain, configured `App.Schema.define()`, explicit
schema registration, direct sole-active-owner execution, source-owned plugin
surfaces, and Typegen as the sole literal cross-schema name graph. It also
requires each migration issue to compare the complete 1/10/50-schema benchmark
with both the original issue-6301 baseline and the immediately preceding
migration point. The documentation-only issue passed `yarn validate:full` with
551 ordinary files/2,605 tests, 626 coverage files/2,853 tests, unchanged
90.91/84.48/96.07/91.47 coverage, and no unresolved audit finding. It handed
the production migration to issue 6303; no push was authorized.

Issue 6303 completed the immutable configured application factory from revision
`9878f191`. `UltimaBase.use(plugin)` now returns a frozen descendant that owns
one exact flat plugin tuple; construction immediately feeds that tuple into the
existing `FrameworkApplication`, compiler, Runtime, lifecycle, and disposal
path. The zero-plugin root remains `new UltimaBase({ schemas })`, while the old
constructor plugin option is retained only as the bounded migration input owned
for deletion by issue 6314 and is no longer taught. Source and packed editor
contracts, plugin identity/order/privilege/lifecycle regressions, all active
public documentation, and the counterbalanced 1/10/50-schema benchmark pass.
The final `yarn validate:full` ran 552 ordinary files/2,611 tests and 628
coverage files/2,860 tests with 90.91/84.49/96.08/91.47 coverage. Issue 6304 is
the next resume point; no push is authorized.

Issue 6304 completed exact Core schema-contract inference from source at
revision `3d876e5b`. Configured `App.Schema.define()` now carries precise Core
field, item, create, update, filter, ordering, selection, inclusion, nested
write, relationship, and numeric contracts without replacing the generated
cross-schema name graph. Standalone `Schema.define()` deliberately retains its
bounded migration behavior until issue 6314 so unmigrated plugin-added fields
remain available. Source and packed editor profiles, the circular Typegen graph,
and the locked 1/10/50-schema benchmark pass. The final `yarn validate:full`
ran 554 ordinary files/2,616 tests and 631 coverage files/2,871 tests with
90.91/84.49/96.08/91.47 coverage. Issue 6305 is the next resume point; no push
is authorized.

Issue 6305 completed Core-native plugin source projections from revision
`bfa25405`. The same authorized registrar calls now type configured root,
embedded, virtual, and output builders, direct options, selected additive
fields, schema/model mutations, and application operations without a second
registry or generated plugin-surface copy. Source and packed editor contracts,
two explicit instances, Runtime provenance and privilege boundaries, Plugin Kit
conformance, and the locked three-sample 1/10/50-schema benchmark pass. The
final `yarn validate:full` ran 555 ordinary files/2,619 tests and 633 coverage
files/2,876 tests with 90.92/84.49/96.08/91.48 coverage. Issue 6306 is the next
resume point; no push is authorized.

Issue 6306 completed sole-active-application direct execution from revision
`d6ae7f1a`. Native CRUD, plugin schema/model mutations, Password User statics,
returned models, and relations now execute from their exact source-typed
surface without an ordinary application argument. Request-local ownership
still takes precedence; inert lifecycle tokens make stale and foreign results
fail before effects without retaining application resources or mutating schema
classes and prototypes. The explicit application paths remain only for the
bounded migration and are still owned for deletion by issue 6314. The final
`yarn validate:full` ran 556 ordinary files/2,622 tests and 634 coverage
files/2,879 tests with 90.84/84.34/96.01/91.41 coverage. Issue 6307 is the next
resume point; no push is authorized.

Issue 6307 completed from revision `7bb941a0`. Its
dependency audit showed that migrating Access, Hooks, and Validation by package
would leave configured schema declarations split between source projections and
removed Typegen fallbacks. ACL and Soft Delete schema options and contributed
fields, plus generic configured specialization for package-owned schemas such
as `RoleSchema`, therefore joined the issue; later operation, business,
persistence, and transport work remains in 6308 and 6309. ADR-0280 retains only
schema Access and Hooks option descriptors in the existing Typegen graph.
The repeated final `yarn validate:full` passed 557 ordinary files/2,629 tests
and 635 coverage files/2,886 tests with 90.85/84.35/96.03/91.42 coverage; the
website passed 17 files/66 tests. An initial sandboxed run was interrupted
after local-listener tests hit `listen EPERM`; the complete unsandboxed rerun
passed. The user approved continuing the milestone and deferred the issue's
new warning-sized files and net line increase to issue 6316's final debt audit.
Issue 6308 is the next resume point; no push is authorized.

Issue 6308 completed the ACL/Roles/Password Auth identity vertical from
revision `401e433c`. The existing policy and identity Runtime contracts remain
unchanged; Password Auth application operation names now infer exact inputs and
results from their installed handlers in source and packed exports. A bounded
configured custom-User proof failed to preserve even a local field on direct
`User.findMany()` results and was removed. The user approved keeping exact User
results in the existing Typegen graph for this milestone, with no parallel
bridge; issue 6316 explicitly audits this exception and the possible later Core
type redesign. The final `yarn validate:full` passed 557 ordinary files/2,631
tests and 635 coverage files/2,888 tests with 90.85/84.36/96.03/91.42
coverage; the website passed 17 files/66 tests. The locked 1/10/50-schema
benchmark passed. Issue 6309 is the next resume point; no push is authorized.

Issue 6309 completed the Soft Delete/vector/PostgreSQL source-typing vertical
from revision `bea238f8`. Soft Delete now projects literal inherited modes and
direct false exceptions, PostgreSQL projects its existing schema and stored
field options from the installed plugin, and pg-vector source/packed tests
protect its configured-only logical builder. Runtime persistence, protected
constraints, transactions, metadata, raw leases, lifecycle, and the logical
vector-only limit did not change. The final `yarn validate:full` passed 557
ordinary files/2,632 tests and 635 coverage files/2,893 tests, with unchanged
90.85/84.36/96.03/91.42 coverage; the website passed 17 files/66 tests. The
locked benchmark passed. Still-consumed PostgreSQL option references and the
Todo example's old constructor path remain assigned to issues 6313/6314.
Issue 6310 projects REST's direct option from its installed source definition,
and source/packed completion, diagnostics, and exact type hover pass. Inline
`rest.count` QuickInfo loses its JSDoc compared with the generated option
baseline because the configured `App.Schema.define()` signature intersects
inferred declared options with plugin validation. A general Core signature
change could affect all schema inference; no speculative bridge or redesign
was added. The user accepted this documentation-only hover limitation for the
milestone. It remains in issue 6316's final limitation-by-limitation audit.

The approved short proof found no safe generic signature correction: TypeScript
6.0.3 retains the JSDoc with a concrete contextual option type, but a generic
capture loses it; restricting the capture to plugin selector keys preserves
documentation but widens required literal values. Hard-coding one selector
would violate Core's plugin neutrality. Core's type signature and Runtime
remain unchanged; only the configured `define` documentation was restored.
No long-running inference exploration is authorized during this milestone.

A complete built-E2E run exposed 13 failures before issue 6310 closed: six
language-service timeouts under default parallelism and seven Core archive
hover assertions. The latter included stale generic fallback expectations
and a genuine loss of `App.Schema.define` JSDoc, separate from the accepted
`rest.count` limitation. The configured declaration regained its documentation,
the packed hover tests now protect exact source types, and the built E2E project
has 20-second language-service headroom. The unrestricted rerun passed 101
files/405 tests. Final `yarn validate:full` passed 557 ordinary files/2,639
tests, 635 coverage files/2,900 tests, and 17 website files/66 tests, with
90.85/84.37/96.04/91.42 coverage. The user authorized continuing after the
6310 review. Issue 6311 is complete; no push is authorized.

Issue 6311 completed GraphQL's configured source-option projection from
revision `95c185b8`. The authorized schema declaration receipt now types
`graphql` on `App.Schema.define()` in source and packed exports without a
generated GraphQL option declaration. The minimal example and initializer
install GraphQL before schema declaration while retaining the same flat
chain, exact operation allowlists, explicit schema registration, and
GraphQL/REST sibling Runtime path. GraphQL Core, Yoga, HTTP, and explorer
execution boundaries did not change. Full `yarn validate:full` passed 557
ordinary files/2,647 tests, 635 coverage files/2,908 tests, and 17 website
files/66 tests. Coverage was 90.86/84.38/96.04/91.43, above issue 6310's
four percentages. The separate full built-E2E run passed 101 files/405 tests,
and the locked 1/10/50-schema benchmark passed twice. Remaining old
constructor fixtures belong to issue 6314; the generic plugin-option hover
documentation limitation remains for issue 6316. Issue 6312 is the resume
point; no push is authorized.

Issue 6312 completed the Plugin Kit, testing, and community conformance
migration from revision `15f68c5f`. The user approved ADR-0281: complete
`WhereInput` stays in Typegen through milestone 63 after two bounded
source-inference attempts failed. A Runtime-only custom-value query still
needs a test cast without a generated registry; the built-export language-
service test proves Typegen-backed DX without one. Do not restart source-only
`where` experiments before issue 6316.

The final audit corrected a PostgreSQL community fixture that declared its
`postgres` option before installing PostgreSQL on the schema factory. The
user also explicitly requested fixing a flaky coverage blocker: PostgreSQL
could report an independent composite-unique collision before the upsert's
targeted email conflict. The adapter now suppresses the speculative insert
and re-locks only the declared target; a conflict on another row still fails.
The final correctly permissioned `yarn validate:full` passed 557 ordinary
files/2,649 tests, 636 coverage files/2,911 tests, and 17 website files/66
tests. Coverage was 90.87/84.39/96.04/91.44, above issue 6311 on every
measure; the complete built E2E passed 102 files/406 tests after the fixture
correction. The locked 1/10/50-schema benchmark passed twice, but its
synthetic hybrid registry omits the retained production `WhereInput`.
Issue 6316 owns the final Typegen-byte and regeneration measurement. Issue
6318 is the resume point after issue 6317's reviewed local commit; no push is
authorized.
