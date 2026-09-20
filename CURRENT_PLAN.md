# Active plan: pre-feature architecture simplification

- Status: active
- Milestone: [30 — Pre-feature architecture simplification](issues/3000-pre-feature-architecture-simplification/README.md)
- Detailed plan: [docs/plans/2026-09-20-pre-feature-architecture-simplification.md](docs/plans/2026-09-20-pre-feature-architecture-simplification.md)
- Resume point: issue 3001

## Objective

Simplify the application and plugin architecture before any new product feature
is started. Preserve every current product behavior and every plugin power with
a proven production consumer, while removing dormant extension contracts and
deriving developer, Typegen, REST, and GraphQL surfaces from one canonical
compiled graph.

The target execution model is one active UltimaBase application per JavaScript
process, concurrent requests within that application, sequential replacement
after disposal, and parallel applications in isolated test workers or
processes.

## Mandatory issue gate

Issues execute sequentially. After implementing one issue, the agent must audit
the complete issue diff for behavior parity, security, plugin ownership,
obsolete paths, tests, documentation, and scope. Any finding keeps the issue in
progress: fix it, rerun the affected validation, and repeat the complete audit.
The next issue may begin only after an audit reports no unresolved finding and
the issue has its dedicated local commit.

No push is authorized by this plan.

## Current step

Start issue 3001 by measuring the clean baseline and classifying every public
plugin power as production-used, required foundation, test-only, or unused. Do
not remove an API or change Runtime behavior in that issue.

Documentation impact: internal engineering documentation until an issue changes
a public contract; those issues must update both package and public website
documentation in the same audited change.
