# Current plan: Source-typed application authoring

- Status: in-progress
- Milestone: 63
- Baseline: `3c130475`
- Completed issues: 6301
- Active issue: 6302
- Next issue: 6303

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
