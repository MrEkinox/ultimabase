# Active plan: pre-feature architecture simplification

- Status: active
- Milestone: [30 — Pre-feature architecture simplification](issues/3000-pre-feature-architecture-simplification/README.md)
- Detailed plan: [docs/plans/2026-09-20-pre-feature-architecture-simplification.md](docs/plans/2026-09-20-pre-feature-architecture-simplification.md)
- Baseline: [docs/plans/2026-09-20-architecture-simplification-baseline.md](docs/plans/2026-09-20-architecture-simplification-baseline.md)
- Contract matrix: [docs/plans/2026-09-20-architecture-contract-matrix.md](docs/plans/2026-09-20-architecture-contract-matrix.md)
- Resume point: issue 3004

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
RuntimeCostProbe API, whose performance measurements must be preserved internally.
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
Issues 3006/3007 implement this accepted target; Runtime is not changed yet.

## Mandatory issue gate

Issues execute sequentially. After implementing one issue, the agent must audit
the complete issue diff for behavior parity, security, plugin ownership,
obsolete paths, tests, documentation, and scope. Any finding keeps the issue in
progress: fix it, rerun the affected validation, and repeat the complete audit.
The next issue may begin only after an audit reports no unresolved finding and
the issue has its dedicated local commit.

No push is authorized by this plan.

Issue 3014 is a hard stop. After its green audit and dedicated commit, stop the
active run and report the Core checkpoint to the user. Do not inspect, start,
or implement issue 3015 without a later explicit user request.

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

## Current step

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

Issue 3003 has a green decision audit; its dedicated local commit precedes 3004.
Issue 3004 removes R-001–R-004/R-009; issue 3005 removes R-005–R-008/R-010.
No Runtime implementation has changed yet. The goal remains issues 3001 through
3014, with the existing hard stop after 3014.

The user additionally requested simple runner-independent test lifecycle
utilities. The proposed callback helper belongs to `@ultimabase/testing` and
the issue 3006 test migration, without a test-only activation bypass. Its exact
public API is still a proposal; it is not part of ADR-0258's accepted contract.

Documentation impact: internal engineering documentation until an issue changes
a public contract; those issues must update both package and public website
documentation in the same audited change.
