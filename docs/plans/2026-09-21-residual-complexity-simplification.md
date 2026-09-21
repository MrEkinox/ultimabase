# Residual complexity simplification

- Status: in-progress — autonomous execution authorized; 3101 complete, 3102 next
- Prepared: 2026-09-21
- Milestone: [31 — Residual complexity simplification](../../issues/3100-residual-complexity-simplification/README.md)
- Baseline revision: `265b54c909404f9690a666bdf39ace01ccee466e`
- Initial evidence: [candidate inventory](2026-09-21-residual-complexity-inventory.md)
- Execution baseline: [issue 3101](2026-09-21-residual-complexity-baseline.md)
- Previous delivery: [milestone 30 final audit](2026-09-21-milestone-30-final-audit.md)
- Current authorization: execute 3101–3112 autonomously, stopping at unresolved decisions or blockers; no push

## Objective and authorization

Remove proven dead internal code and duplicated implementations, then examine
residual mechanisms built for extension powers removed in milestone 30.
Preserve current functionality, stability and used plugin capabilities.

Milestone 30 remains completed. Its accepted ADRs, contract matrix, audit and
measurements remain historical evidence; this plan does not reopen or rewrite
their completed issues. Milestone 31 establishes its own baseline and decision
delta. On 2026-09-21, after the preparation commit, the user explicitly authorized
this milestone's autonomous execution with the per-issue audit loop and commit
rule. The decision gates in 3105/3107 remain; no push is authorized.

The user requested the audit/correction loop and one dedicated local commit per
issue. This is an execution protocol using existing repository tools, not a new
automation service, agent framework, generic audit API or test-only product
option. No scheduling, feature work or package publication is authorized.

## Preservation contract

The default is observable parity with the milestone 30 result, including:

- TypeScript inference, autocomplete, hover documentation, public and packed
  exports, JavaScript without Typegen, immutable Query and schema/model APIs;
- schemas, fields, options, additive patches, deterministic selectors,
  relationships, contextual filters, virtual results, CRUD and nested writes;
- application operations, schema mutations, Password Auth methods, existing
  Soft Delete modes and private Master restoration/purge;
- Hooks, Access, Validation, ACL, Roles and independent community equivalents,
  with unchanged ownership, privilege checks and monotonic enforcement;
- PostgreSQL persistence, private records, physical contributions, raw-adapter
  leases, transactions, rollback, synchronization policies and data integrity;
- REST paths/payloads/errors, GraphQL SDL/results/errors, HTTP identity, Hono,
  Yoga and explorers through the same narrow Core execution boundary;
- one initialized application per JavaScript realm, concurrent request
  isolation, isolated parallel workers, sequential replacement after complete
  disposal, failure cleanup and stale-authority rejection;
- current performance measurements and tests protecting retained invariants.

Core must remain product-neutral. Access must not learn Soft Delete vocabulary.
Official plugins receive no private replacement for a removed public mechanism.

The [milestone 30 matrix](2026-09-20-architecture-contract-matrix.md) is inherited
at its final state, not at its original pre-removal state. Issue 3101 records the
new baseline with links to every retained behavior, authoring power and protocol.
All differences must map to an exact accepted milestone 31 decision. The old
R-001–R-010 approval does not authorize new public removals.

An implementation, export, descriptive example or self-testing fixture alone
does not establish current product need. Actual applications, generated
projects, engineering tools and security/lifecycle/conformance invariants do.
A name search alone is insufficient: check imports, reexports, actual public
package roots, dynamic registration and identity-based use. Unknown external
usage cannot be disproved by repository search; public removals are explicit
pre-release contract decisions, not claims that no third-party user exists.

## Sequential scope

| Issue | Work                                                                           | Additional gate                                 |
| ----- | ------------------------------------------------------------------------------ | ----------------------------------------------- |
| 3101  | Refresh baseline, consumers, invariants and exact removal candidates           | Completed; baseline validated                   |
| 3102  | Remove proven unused private Core helpers                                      | Unchanged public contract                       |
| 3103  | Remove the unused Access declaration circuit                                   | Unchanged public contract                       |
| 3104  | Remove the unused Hooks circuit and duplicate field-path implementation        | Type/editor parity                              |
| 3105  | Decide the smallest internal schema compilation design                         | User-approved ADR before 3106                   |
| 3106  | Simplify the canonical compiler and remove superseded plumbing                 | Only the accepted 3105 design                   |
| 3107  | Decide unused Runtime-stage, Typegen-marker and migration contracts separately | Explicit decision for each candidate            |
| 3108  | Remove the unused Runtime stage contribution branch, if approved               | Exact 3107 scope                                |
| 3109  | Remove the unread Typegen emitter marker, if approved                          | Exact 3107 scope                                |
| 3110  | Remove migration anticipation, if approved                                     | Exact 3107 scope; preserve actual storage needs |
| 3111  | Reconcile the complete affected public website journeys                        | Same-issue documentation already current        |
| 3112  | Final parity, removal, coverage and measurement audit                          | Hard stop after its commit                      |

Every issue depends on the preceding issue. A green audit and a dedicated commit
are both required for each delivered issue before the next issue starts. No
speculative implementation is permitted while a decision is pending.

Issues 3105 and 3107 are decision work, not permission to accept an ADR on the
user's behalf. Present concrete options, consumer evidence, exact observable
differences and the smallest proposed scope. Stop and wait where approval is
required. Once a decision is explicitly accepted, do not ask for it again.

For 3107, record an independent decision for each of the three candidates;
approval of one is not approval of the others. If the user retains a candidate,
the corresponding removal issue becomes `superseded` with the accepted decision
and retained-contract evidence, never falsely `completed`. A pending decision
remains blocked; no automatic skip or indefinite audit retry resolves it.
Apply the same rule to 3106 if the existing compiler design is retained.
A superseded removal is resolved by the decision issue's audited commit,
which records the retained contract and status change. It needs no fake
implementation or empty commit; later dependencies use that explicit terminal
decision. This is the sole exception to one commit per delivered issue.

## Mandatory issue loop

1. Read the issue, dependencies, current authorization, affected package
   READMEs and ADRs. Inspect Git state and preserve unrelated edits and stashes.
   Record the starting revision and relevant contract/measurement baseline.
2. Implement only the approved scope, necessary regression/type tests and
   documentation. Update removal evidence as candidates are confirmed or rejected.
3. Run focused validation, then the broader checks justified by the affected
   contracts. Record actual command results and any unavailable prerequisite.
4. Audit the complete issue diff, including tests, exports, generated artifacts,
   documentation and deletions. Passing tests alone is not a green audit.
5. For any finding inside the accepted scope, correct it, rerun affected checks
   and repeat the complete audit. There is no fixed iteration limit and no
   unresolved issue finding may be waived to start the next issue.
6. If the finding crosses the stop boundary below, stop and explain the evidence
   and choices to the user. Do not code around it or broaden scope.
7. After zero unresolved findings and all required checks pass, record the final
   audit, one Documentation impact classification, exact delivered removals and
   preserved behavior. Update the issue, inventory, root removal history and
   current resume point. Any edit after that audit requires another diff review.
8. Create one dedicated local commit. Inspect its complete diff and scope.
   Report its hash and exact added/deleted/net line counts to the user, including
   tests, documentation and generated files; separate production reductions.
   Advance only after this verified commit. Do not push.

Each issue handoff records the iterations rather than asserting an unspecified
"audit green":

| Iteration | Finding/evidence | Correction or decision | Validation result | Remaining findings |
| --------- | ---------------- | ---------------------- | ----------------- | ------------------ |

Record the final reviewed revision/diff scope, actual validation commands,
Documentation impact, changes beyond original criteria (normally none), and
the dedicated commit. A commit cannot contain its own hash; report it after
commit and record it at the next handoff without adding a bookkeeping commit
or rewriting history solely to embed that hash.

## Architecture and blocker stop

Stop before changing an unapproved boundary when there is an uncertain consumer,
a required invariant with no demonstrated replacement, a public behavior loss
outside an accepted decision, a dependency-direction violation, a new public
abstraction, or an architectural contradiction. Explain the proven need,
smallest options and consequences; wait for the user to decide.

Infrastructure, build/archive or test failures that prevent required
verification must be reported accurately. Routine regressions caused by the
issue stay in the correction loop; an unavailable prerequisite or unresolved
question blocks completion and the next issue. Do not reduce coverage
thresholds, relax security checks, discard a retained scenario or declare
success because retries were exhausted.

If new independent simplification candidates appear, record them as proposals
and stop for scope direction instead of silently extending this milestone.
Do not resume paused ACL work, the suspended Soft Delete stash, or any new
product capability. Stop expressly after issue 3112 and its dedicated commit;
no subsequent milestone or push follows automatically.

## Documentation

Every issue handoff contains exactly one `Documentation impact` classification:
`none`, `internal engineering documentation`, `public website documentation`,
or `both`. Explain a `none` classification concretely.

Any accepted public change updates the affected package README, examples and
pages under `apps/website/content/docs` in the same issue and audited commit.
Use `apps/website/content/documentation-ownership.json` and page `sources` to
find affected journeys. Review source and built TypeScript examples. Engineering
READMEs and ADRs never substitute for the public documentation site.

Issue 3111 checks the whole journey again; it cannot postpone earlier public
documentation changes. Planning does not change current website API guidance.
Schema-domain edits also review `packages/core/examples/schema` and update
examples when their behavior or inference changes.

Keep historical ADR text intact. New accepted ADRs supersede only named parts
of previous decisions. Root `HISTORIQUE_SUPPRESSIONS.md` separates proposed,
approved and delivered removals, with exact issue evidence; planned work is
never presented as already removed.

## Validation and measurements

Reuse existing checks and measurement tools. For each implementation issue,
start with affected runtime/type tests, then run the root gates required by
AGENTS: `yarn typecheck`, `yarn test`, `yarn lint`, `yarn build`.
Run `yarn constraints`, relevant built/packed/PostgreSQL conformance and
website checks according to the changed boundaries. Decision-only issues use
metadata, links, formatting and decision-consistency checks.

Capture full coverage at baseline and final audit and whenever an intermediate
change affects cross-cutting compilation or execution. Compare retained
statement/function/branch locations and scenarios, not only global percentages.
Account separately for deleted dead code and removed API self-tests; do not
delete tests that protect a retained behavior. No threshold/exclusion relaxation.

Use existing `yarn measure:simplification` and runtime baseline tools with the
same counting definitions and matched Node/database/environment settings.
Separate production, tests, tooling, generated output and documentation.
Measure exports and declaration shape after canonical builds. Compare startup,
memory, current no-product/Hooks/Access scenarios and representative change
fan-out; do not add a public probe or a generic production observer.

The 304 lines in the initial dead-function inventory, 143-line Hooks duplicate
and 3,648-line compiler directory are different measurements, not additive
guaranteed savings. Report actual final deltas, no invented complexity percentage
or promised speedup. Compare CI only after a separately authorized push, with
matching jobs, selection, caches and runner conditions; otherwise report CI as
unmeasured for this milestone.

The final issue reconciles every retained contract and exact approved removal,
runs the complete source/coverage/built/packed/PostgreSQL and relevant website
validation, compares measurements, records limits and closes the milestone.
Any unresolved required check prevents completion.

## Preparation handoff

Documentation impact: both. This change prepares the internal milestone and
updates the public roadmap to distinguish the completed first pass from the
planned second pass. No shipped API, runnable example or public capability is
changed; no proposed removal is documented as delivered.

Preparation audited against `265b54c9` plus the complete planning diff. No
implementation issue has started. The work is confined to the twelve issue
specifications, milestone/plan/inventory, navigation and removal records, the
archived execution log and one public roadmap page.

| Iteration | Finding/evidence                                                                                                                                                         | Correction                                                                                                                                       | Result                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 1         | The blanket dedicated-commit rule did not explain a conditional removal superseded by a retention decision; the inventory also used an incorrect compiler function label | State that the accepted retention is resolved by its decision issue's audited commit; correct the label to compileSchemaDeclarations             | Rechecked plan, current pointer, milestone and final issue for consistent dependencies and truthful terminal states |
| 2         | Complete preparation audit after corrections                                                                                                                             | Verified all six findings, twelve ordered issues, preservation/decision gates, documentation timing, root history and final stop; no new finding | No unresolved preparation finding; metadata, links, documentation and relevant website gates pass                   |

Validation evidence:

- `yarn check:issues`: 9 tests pass; all twelve new issues are planned, unique
  and sequentially dependent, starting after completed 3034.
- A relative-link audit covers 184 links in changed/new Markdown documents;
  every destination exists. The archived execution log is identical to the
  former root log apart from its explanatory header and rebased relative links.
- `yarn vitest run --project unit tooling/documentation/active-contracts.test.ts`:
  5 tests pass.
- `yarn website:validate`: 66 content checks pass.
- `yarn website:typecheck`, `yarn website:lint`, `yarn website:build`: pass.
  Lint retains the existing 431-line warning in the unchanged
  `visual-system.browser.test.ts`; no lint error or new warning.
- `yarn vitest run --project website-browser apps/website/tests/preview-readiness.browser.test.ts apps/website/tests/page-actions.browser.test.ts`:
  24 browser checks pass, including the public roadmap and Markdown exposure.
- Changed-document Prettier and `git diff --check` pass before commit.

No package implementation, test, tooling, accepted ADR or milestone 30 issue
changed. Package runtime/PostgreSQL/coverage suites were not rerun for this
planning and roadmap-copy change; 3101 owns the future measured baseline.
No push or implementation is part of this preparation commit.
