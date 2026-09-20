# Active plan: pre-feature architecture simplification

- Status: active
- Milestone: [30 — Pre-feature architecture simplification](issues/3000-pre-feature-architecture-simplification/README.md)
- Detailed plan: [docs/plans/2026-09-20-pre-feature-architecture-simplification.md](docs/plans/2026-09-20-pre-feature-architecture-simplification.md)
- Baseline: [docs/plans/2026-09-20-architecture-simplification-baseline.md](docs/plans/2026-09-20-architecture-simplification-baseline.md)
- Contract matrix: [docs/plans/2026-09-20-architecture-contract-matrix.md](docs/plans/2026-09-20-architecture-contract-matrix.md)
- Resume point: issue 3003

## Objective

Simplify the Core, application, and every existing official plugin before any
new product feature is started. Preserve every current product behavior and plugin capability by
default. A capability may disappear only when the inventory proves that it has
no current runtime consumer, public or community contract, documented promise,
example or generated-project dependency, or required architecture, security,
lifecycle, and conformance invariant, and the user explicitly approves its
removal. The sole approved used-capability exception is D-001 / ADR-0258:
concurrent initialized applications and shared-server application routing.
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

Issue 3001 is complete and committed as `b2c10fc2`. Issue 3002 records the user's
explicit approval and the accepted
[ADR-0258](docs/adr/0258-single-active-application-lifecycle.md), with the
[impact and audit inventory](docs/plans/2026-09-20-single-active-application-impact.md).
After its green audit and dedicated commit, continue with issue 3003's exact
kernel retention/removal decision. The goal remains issues 3001 through 3014,
with the existing hard stop after 3014.

The user additionally requested simple runner-independent test lifecycle
utilities. The proposed callback helper belongs to `@ultimabase/testing` and
the issue 3006 test migration, without a test-only activation bypass. Its exact
public API is still a proposal; it is not part of ADR-0258's accepted contract.

Documentation impact: internal engineering documentation until an issue changes
a public contract; those issues must update both package and public website
documentation in the same audited change.
