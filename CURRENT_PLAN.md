# Current plan: Runtime boundary regression repair

- Status: completed
- Milestone: 57
- Baseline: `270d60b9`
- Completed issue: 5701

The complete coverage gate revealed two source-mode PostgreSQL E2E regressions
that the ordinary root test command does not select. Bisecting unchanged tests
proved that milestone 44 stopped returning Hooks' validated result snapshot and
milestone 45 decoded complete mutation outcomes for native mutations that Access
does not consume.

Restore the exact pre-refactor behavior without weakening either test: Hooks
must return the validated snapshot that retains private selection metadata, and
Access must use Core's complete mutation-outcome decoder only for upserts, the
sole native branch whose materializations it consumes. Then run the complete
coverage gate plus the standard repository validation before committing.

No push is authorized.

## Outcome

Hooks again returns Core's validated mutation-outcome and result snapshots, so
private selection metadata survives ordered behavior composition. Access now
invokes the complete mutation-outcome decoder only for native upserts, the only
branch where it reads materializations. The unchanged public nested-write and
virtual-field verticals pass, as does the complete coverage gate.
