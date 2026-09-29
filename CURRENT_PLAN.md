# Current plan: Source-typed application authoring

- Status: in-progress
- Milestone: 63
- Baseline: `3c130475`
- Completed issues: 6301, 6302, 6303
- Active issue: 6304
- Next issue: 6305

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
