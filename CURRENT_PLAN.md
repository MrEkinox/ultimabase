# Active plan: pre-feature architecture simplification

- Status: active — plugin wave explicitly resumed; next issue 3029
- Milestone: [30 — Pre-feature architecture simplification](issues/3000-pre-feature-architecture-simplification/README.md)
- Detailed plan: [docs/plans/2026-09-20-pre-feature-architecture-simplification.md](docs/plans/2026-09-20-pre-feature-architecture-simplification.md)
- Baseline: [docs/plans/2026-09-20-architecture-simplification-baseline.md](docs/plans/2026-09-20-architecture-simplification-baseline.md)
- Contract matrix: [docs/plans/2026-09-20-architecture-contract-matrix.md](docs/plans/2026-09-20-architecture-contract-matrix.md)
- Removal history: [HISTORIQUE_SUPPRESSIONS.md](HISTORIQUE_SUPPRESSIONS.md)
- Resume point: issue 3029; continue sequentially through issue 3034

## Objective

Simplify the Core, application, and every existing official plugin before any
new product feature is started. Preserve every current product behavior and plugin capability by
default. The user approved removing capabilities with no concrete current use:
their own implementation, API exports, documentation, illustrative examples,
and self-testing fixtures alone do not justify retention. Actual product,
plugin, application, generated-project, or engineering-tool consumers and
required architecture, security, lifecycle, and conformance invariants still
count. Record the exact removal and public impact before implementation; do
not preserve speculative compatibility layers or recreate unused powers under
a new API. Reintroduce a capability only when a concrete need arises.
The approved used-capability exceptions are D-001 / ADR-0258 (concurrent
initialized applications and shared-server application routing) and the public
RuntimeCostProbe API, whose performance measurements must be preserved internally,
and D-005 / ADR-0262 (executable values removed from descriptive Typegen inspection).
Developer, Typegen, REST, and GraphQL surfaces then derive from one
canonical compiled graph.

After the Core migration passes its checkpoint, each of the 16 current plugin
packages receives its own bounded simplification issue. Those issues remove
plugin-local duplication and obsolete adaptations to the former Core while
preserving the same public contract by default.

The user approved ADR-0258 through issue 3002: one initialized UltimaBase
application per JavaScript realm, concurrent requests within that application,
sequential replacement after complete disposal, and parallel applications in
isolated test workers or processes. HTTP identity is retained; shared Hono
application hosting and `HttpApplicationMountTable` are removed by issue 3007.
Issue 3006 enforces the accepted lifecycle target. Issue 3007 removes the
shared HTTP ownership machinery made unreachable by that limit.

## Mandatory issue gate

Issues execute sequentially. After implementing one issue, the agent must audit
the complete issue diff for behavior parity, security, plugin ownership,
obsolete paths, tests, documentation, and scope. Any finding keeps the issue in
progress: fix it, rerun the affected validation, and repeat the complete audit.
The next issue may begin only after an audit reports no unresolved finding and
the issue has its dedicated local commit. Update `HISTORIQUE_SUPPRESSIONS.md` in
that commit with exact removals, preserved behavior, and the delivered issue;
planned or in-progress work must never be presented as completed.

For every completed issue, report the exact added and deleted line counts from
its dedicated commit and the net change (`added - deleted`) to the user. Count
the complete issue diff, including tests, documentation, and generated files;
do not confuse an in-progress diff with a completed issue's result.

No push is authorized by this plan.

The original stop after issue 3014 was observed. The user has now explicitly
authorized autonomous continuation through the remaining milestone 30 issues
3015–3034. Keep the per-issue correction/audit loop and dedicated local commit.
Stop for any architectural question or decision and explain it before changing
the boundary. Stop after the final milestone audit in 3034. A possible later
simplification milestone is a future discussion, not authorized work.

Any issue that changes public behavior, configuration, exports, errors, or
examples must update the affected pages under `apps/website/content/docs` in
the same audited commit. Dedicated website-documentation issues then review the
complete Core/plugin-authoring, data/security/persistence, and HTTP/transport
journeys after implementation. Package READMEs do not substitute for this site
work.

## Architecture stop gate

Routine findings stay inside the fix, validation, and complete re-audit loop.
If an issue reveals an architectural contradiction, an uncertain consumer, a
behavior loss outside an explicitly approved removal, a need for a new public
abstraction, or a boundary not covered by the accepted decisions, stop before
changing that boundary. Record the evidence, explain why the issue cannot
continue safely, present the smallest options and their impact, and wait for the
user to decide. Do not code around the problem or broaden the architecture in
the meantime.

## Current authorization

Resume the 16 plugin audits, then the three public website reconciliation
issues and final milestone audit. Preserve all used functionality and plugin
capabilities. No push is authorized. The Core-run records below are historical;
their 3014 stop statements do not cancel this later explicit resumption.

## Historical Core run

Issue 3001 is complete in `b2c10fc2`, and issue 3002 is audited and committed as
`481b3723` with accepted
[ADR-0258](docs/adr/0258-single-active-application-lifecycle.md).
Issue 3003 records all ten approved removals in
[ADR-0259](docs/adr/0259-smaller-plugin-kernel-and-canonical-commands.md) and its
[decision audit](docs/plans/2026-09-20-smaller-kernel-decision-proposal.md).
R-001–R-007 and the public RuntimeCostProbe exception were approved first;
the user then explicitly approved the three additional audit findings as
R-008 (destructive patches), R-009 (generic Core observers), and R-010
(arbitrary schema/model operation commands). Keep actual Password Auth methods,
Soft Delete schema mutations, product-owned Hooks/Access events and diagnostics,
and equivalent internal performance measurements. Do not request these
approvals again.

Issue 3003 is audited and committed as `f7e9596b`. Issue 3004 is complete with
a green removal and behavior audit: the approved replacement/observer machinery
is removed, equivalent Runtime measurements stay internal, and source, packed,
PostgreSQL, website, build, typecheck, lint, and constraint checks pass.
Issue 3004 is committed as `5adb09b3`. Issue 3005 is committed as `21bb2e8f` with a green
removal and retained-behavior audit: R-005–R-008/R-010 are removed, real schema
mutations and consumed type references remain, and source, packed, PostgreSQL,
website, build, typecheck, lint, and constraint checks pass. Its dedicated local
commit delivers the root removal history requested by the user.
Issue 3004 removes R-001–R-004/R-009; issue 3005 removes R-005–R-008/R-010.
The Runtime uses direct Core assembly. Issue 3006 implements its accepted
lifecycle contract; the existing stop gate applies to any new public API.
The goal remains issues 3001 through 3014, with the hard stop after 3014.

The user approved using the existing lifecycle directly in test suites:
`beforeAll(() => ultimabase.start())` and
`afterAll(() => ultimabase.dispose())`, with the hooks returning the promises.
No `withUltimaBase` helper or additional public testing API is introduced.
Jest and Vitest suites reuse their application for the suite lifetime; separate
workers remain isolated and sequential suites dispose before replacement.
Issue 3006 is complete with a green audit: one initialized owner, draining
teardown, fail-closed cleanup, stale authority rejection, current-graph mutation
visibility, isolated workers and sequential fixture migration. All 2,510
unit/type/performance and 379 integration tests pass, alongside typecheck,
build, lint, website and constraints. Its dedicated commit precedes issue 3007.
Issue 3006 is committed as `30bd1452`: +4,141 / -2,455 lines, net +1,686,
including tests and documentation. Nothing was pushed.

Issue 3007 is complete with a green audit under ADR-0258 and the explicitly
approved [ADR-0260](docs/adr/0260-single-owner-http-dispatch.md). The HTTP mount
table, Hono application set and shared-policy comparison are removed. One
optional owner retains safe absent-application errors through the approved
public dispatch utility. Exact bootstrap ownership, identity, credentials,
Master, CORS, listener cleanup and sequential provider reuse remain.
All 2,523 unit/type/performance and 379 integration tests pass, alongside
typecheck, build, lint, website and constraints. Production TypeScript shrinks
by 240 lines with no Core implementation change. Issue 3007 is committed as `fc579bf4`: +1,114 / -921 lines, net +193,
including tests and documentation. Nothing was pushed.

Issue 3008 is complete with a green audit under the user-approved
[ADR-0261](docs/adr/0261-command-compilation-and-binding-phases.md). One private
canonical graph owns declarations and exact application bindings; Runtime's
four handler/transport maps and repeated planner ownership checks are removed.
Derived adapters preserve existing identity, ordering, API and plugin behavior.
The final 2,529 unit/type/performance and 379 integration tests pass, alongside
typecheck, build, lint, website, constraints and issue metadata. This foundation
adds 100 production TypeScript lines; public exports and declaration bytes are
unchanged. Issue 3008 is committed as `86a5bbd8`: +1,365 / -604 lines, net +761,
including tests and documentation. Nothing was pushed.
The bounded consumer migrations remain issues 3009–3012, followed by the removal
audit and checkpoint. Stop after issue 3014 remains mandatory.

Issue 3009 is complete with a green audit. Application operation execution now
reads canonical command records; direct handles and transports share input
snapshot/envelope preparation. Required/optional/forbidden transactions, request
context, owner attribution, public errors and result snapshots remain unchanged.
Password Auth and Plugin Kit need no production or public API change. All 2,532
unit/type/performance and 379 integration tests pass, alongside typecheck, build,
lint, constraints and issue metadata. Production adds 52 lines during this bounded
migration; exports and declaration bytes stay unchanged. Its dedicated local
commit is `08c0b334`: +414 / -126 lines, net +288, including tests and
documentation. No push is authorized; stop after 3014.

Issue 3010 is complete with a green audit. Schema mutation Runtime uses exact
canonical commands and frozen schema-local alias membership. The old private
source table and duplicate payload/projection preparation are removed. Logical
Soft Delete, native delete rewriting, private Master administration, Access,
Hooks, protected targeting, relations and transaction behavior remain unchanged.
A validation-order finding was corrected and protected by a wire regression.
All 2,533 unit/type/performance and 379 integration tests pass; typecheck, build,
lint, constraints and issue checks pass. This transition adds 50 production lines
with unchanged exports and declaration bytes. Its dedicated local commit is
`394045ab`: +573 / -167 lines, net +406, including tests and documentation.
No push; hard stop after issue 3014.

Issue 3011 resumes under the explicitly approved
[ADR-0262](docs/adr/0262-descriptive-typegen-command-inspection.md). The user
approved removing executable operation tokens, input/result snapshot callbacks
and schema constructors from the existing Typegen inspection view. Descriptions,
nominal type references, owners and alias ordering remain; direct execution and
generated declarations retain their behavior. No additional graph API or
compatibility path is authorized. Add an unused option later only when an actual
requirement justifies it. Issue 3011 is complete with a green audit: the obsolete
Typegen bridge is removed, source/built inspection is descriptive, and generated
output/fingerprints remain byte-identical. All 2,534 unit/type/performance tests,
381 integration tests and 66 website checks pass, with build, typecheck, lint and
constraints. Production shrinks by one line; public export names stay unchanged.
Its dedicated local commit is `c5073432`: +389 / -78 lines, net +311,
including tests and documentation. No push; stop after 3014.

Issue 3012 is complete with a green audit. Plans and executable allowlists share immutable
descriptors from canonical commands and exact materialized bindings. Existing
public planning/execution facades and their authority/lifecycle boundaries remain.
Obsolete descriptor assembly, binding scans and GraphQL correspondence state are
removed. All 2,535 unit/type/performance tests, 381 integrations and 66 website
checks pass, alongside build, typecheck, lint and constraints. Production shrinks
by 111 lines with unchanged public exports and declaration size. Its dedicated
local commit precedes 3013. No push; the hard stop after 3014 remains.

Documentation impact: internal engineering documentation until an issue changes
a public contract; those issues must update both package and public website
documentation in the same audited change.

Issue 3012 is committed as `df49ccdd`: +376 / -310 lines, net +66,
including tests and documentation; production shrinks by 111 lines. Issue 3013
now audits the complete milestone, captures full coverage before cleanup, and
removes only proven residual adapters and duplicate verification setup. No push
is authorized; the hard stop after 3014 still applies.

Issue 3013 is complete with a green complete-diff and coverage-location audit.
The final private source-token fallback is removed; conformance orchestration is
shared without deleting a scenario, and stale internal/public documentation is
corrected. All 2,776 coverage-gate tests, 381 built integrations, 66 website
content tests and 56 browser tests pass, alongside typecheck, build, lint,
constraints and formatting. Every retained coverage location stays covered as
before. Production shrinks by four lines; exports and declaration bytes remain
unchanged. Its dedicated commit precedes the clean-checkout audit in 3014.
Stop after 3014; no plugin issue or push is authorized.

Issue 3013 is committed as `0828a1f4`: +341 / -156 lines, net +185,
including tests and documentation. Issue 3014 verifies that revision from a
clean detached checkout. No plugin-local issue is inspected or started.
The run must stop immediately after the 3014 audit and dedicated local commit.

Issue 3014 is complete with a green clean-checkout audit. The missing create-app
compiler reference is fixed and protected; 2,777 coverage tests, 2,536 ordinary
tests, 381 built integrations, 66 website content tests and 56 browser tests
pass. Coverage locations, source/packed APIs and all retained contracts are
reconciled in the [checkpoint report](docs/plans/2026-09-21-core-kernel-simplification-checkpoint.md).
The baseline for each of the 16 plugins is recorded without starting those issues.

**Authorized run finished: stop after this dedicated 3014 commit.**
Milestone 30 remains open. Do not inspect or start issue 3015, resume a paused
feature, or push without a later explicit user request. Editor settings and the
suspended Soft Delete stash remain untouched. The exact commit line counts are
reported to the user after committing.

## Plugin wave execution

Issue 3015 starts from the audited `23b75027` checkpoint. The user explicitly
authorized completing milestone 30 in autonomy, stopping for questions or
architecture decisions. Preserve the unrelated editor settings and suspended
Soft Delete stash; no new product work or subsequent milestone is authorized.

Issue 3015 is complete with a green audit: Access loses 42 production lines by
removing dead relation dispatch, duplicate selection finalization and two
result-discard callbacks. Its 79 exports and built declarations are unchanged.
All 2,778 source coverage tests and 381 built integrations pass, with no retained
coverage regression. Continue with issue 3016 after the dedicated 3015 commit.

Issue 3015 is committed as `4d6faa2a`: +242 / -107 lines, net +135, including
tests and documentation. Issue 3016 is complete with a green audit: Hooks loses
92 production lines, retains its 102 exports and byte-identical declarations,
and passes all 2,778 source coverage tests plus 38 affected built integrations.
Website/README corrections follow existing runtime behavior. Continue with
issue 3017 after the dedicated 3016 commit.

Issue 3016 is committed as `bc8aeb06`: +190 / -171 lines, net +19, including
readability and documentation corrections. Issue 3017 is complete with a green
audit: Validation removes seven executable source lines and an unused 23-line
fixture, retains its nine exports and byte-identical declarations. All 2,778
source coverage tests pass with no retained coverage regression; final package,
root typecheck, build, lint and both built integrations pass after fixture
removal. Continue with issue 3018 after the dedicated 3017 commit.

Issue 3017 is committed as `0f5fe233`: +112 / -60 lines, net +52, including
tests and documentation. Issue 3018 is complete with a green audit: Roles
removes 84 production lines, including a discarded hierarchy snapshot and an
obsolete private bulk-deletion guard. Its 40 exports and declarations are
unchanged. All 2,778 coverage tests, 22 affected built integrations and 66
website checks pass, with no lost retained coverage. Documentation now matches
the existing ADR-0164 atomic deletion behavior. Continue with issue 3019 after
the dedicated 3018 commit.

Issue 3018 is committed as `e6ba1934`: +173 / -146 lines, net +27, including
tests and documentation. Issue 3019 is complete with a green audit: ACL removes
144 production lines and one obsolete internal result adapter. Its 42 exports
and declarations remain identical. The 333 package/boundary/source-integration
checks and 43 built integration checks pass, with no lost retained ACL coverage
against the full 3018 baseline. Core and Access remain unchanged. Continue with
issue 3020 after the dedicated 3019 commit.

Issue 3019 is committed as `129132a8`: +127 / -195 lines, net -68, including
tests and documentation. Issue 3020 is complete with a green audit: Password
Auth removes 95 production lines, retaining 32 exports and byte-identical
declarations. All 318 package/boundary/source-integration tests and 106 built
integration/archive checks pass, with no lost retained coverage. The new batch
test's fixture isolation was corrected before the final successful audit.
Continue with issue 3021 after the dedicated 3020 commit.

Issue 3020 is committed as `72abe7a0`: +205 / -142 lines, net +63, including
tests and documentation. Issue 3021 is complete with a green audit: Soft Delete
removes 50 production lines and retains its five exports with equivalent public
types. The 274 source checks and 23 built integrations pass, with no retained
coverage loss. Modes, visibility, logical identities, private Master
administration and the suspended stash are unchanged. Continue with issue 3022
after the dedicated 3021 commit.

Issue 3021 is committed as `56f88b28`: +126 / -97 lines, net +29, including
engineering records. Issue 3022 is complete with a green audit: PostgreSQL
removes 97 production lines, retaining its 39 exports and byte-identical
declarations. The full coverage run passes 2,778 tests; its only failure was
issue-status spelling, corrected with all nine backlog checks passing. No
retained PostgreSQL coverage is lost. All 383 built integrations and 66 website
checks pass. Continue with issue 3023 after the dedicated 3022 commit.

Issue 3022 is committed as `581828e9`: +154 / -149 lines, net +5, including
engineering records. Issue 3023 is complete with a green audit: the Vector
plugin already has one shared implementation and needs no forced reduction.
Its 246 production lines and 11 exports are retained. Only a JSDoc and README
explanation are corrected; executable code and public type structure are
identical. All 56 focused source/type checks and eight built checks pass.
Continue with issue 3024 after the dedicated 3023 commit.

Issue 3023 is committed as `32b6dec0`: +91 / -20 lines, net +71, including
engineering records. Issue 3024 is complete with a green audit: HTTP removes
18 production lines, the redundant state lookup and duplicate configuration
copies, preserving all 64 exports and declaration text apart from region order.
The GraphQL HTTP contract remains unchanged. All 364 source/boundary checks
and 383 built integrations pass with no retained coverage loss. Continue with
issue 3025 after the dedicated 3024 commit.

Issue 3024 is committed as `e059251e`: +141 / -70 lines, net +71, including
engineering records. Issue 3025 is complete with a green audit: Hono removes
private lifecycle relays and redundant conditions (-3 production lines), keeping
all six exports and byte-identical declarations. All 277 source checks and
147 affected built integrations pass, including Chromium and cleanup failures,
with no retained coverage loss. Continue with issue 3026 after its commit.

Issue 3025 is committed as `c9d79ffc`: +126 / -51 lines, net +75, including
engineering records. Issue 3026 is complete with a green audit: REST removes
80 production lines, retaining 45 exports and byte-identical declarations.
All 358 source/boundary checks and 383 built integrations pass with no retained
coverage loss. Wire paths, payloads, errors, codecs and security checks remain
unchanged. Continue with issue 3027 after the dedicated 3026 commit.

Issue 3026 is committed as `3aa4f59e`: +180 / -182 lines, net -2, including
engineering records. Issue 3027 is complete with a green audit: GraphQL removes
48 production lines, retaining 33 exports and byte-identical declarations.
All 2,779 full-coverage tests and 383 built integrations pass. Global thresholds
remain unchanged and no retained GraphQL coverage is lost. SDL, cursors,
composition, ownership and disposal keep their contracts. Continue with issue
3028 after the dedicated 3027 commit.

Issue 3027 is committed as `fb0a2a15`: +161 / -118 lines, net +43, including
engineering records. Issue 3028 is complete with a green audit: Yoga already
retains the necessary HTTP adapter boundaries, so no production reduction is
forced. Its 815 lines/four exports and GraphQL HTTP's 82 lines/three exports
remain identical. The README example is corrected; all 51 final source/type,
52 built/archive and 66 website checks pass. Continue with issue 3029 after
the dedicated 3028 commit.
