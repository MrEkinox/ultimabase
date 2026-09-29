# Current plan: Source-typed application authoring

- Status: in-progress
- Milestone: 63
- Baseline: `3c130475`
- Completed issues: 6301, 6302, 6303, 6304, 6305, 6306, 6307, 6308
- Active issue: 6309
- Next issue: 6310

Replace plugin-generated authoring surfaces with the user-approved configured
application factory and source-typed plugin contract while retaining Typegen as
the sole cross-schema name graph. The exact target is frozen in the
[DX contract](docs/plans/2026-09-28-source-typed-application-authoring-target.md):
plugins install only through `UltimaBase.use()`, schemas retain the current
`App.Schema.define({ className, fields, ... })` form, registration stays
explicit, direct class commands resolve the sole active application, plugin
surfaces infer from source, and Typegen remains only where the exact
cross-schema graph requires it.

The current logical `pg-vector` field remains source typed only on factories
that install `pgVectorPlugin()`. Milestone 63 does not add physical PostgreSQL
vector persistence; its proof covers conditional builder presence, inference,
hover, diagnostics, and static compilation only.

Issue 6301 is a mandatory evidence gate. It locks compiler, language-service,
memory, hover, diagnostic, and complexity budgets before any production public
API migration. If the proof requires another installation path, a permanent
bridge, duplicated plugin contracts, capability loss, or unacceptable
TypeScript cost, stop for architecture review.

Issues 6301–6316 run sequentially with one dedicated commit and complete
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
