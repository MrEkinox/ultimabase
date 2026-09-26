# Current plan: Runtime stage-plan simplification

- Status: completed
- Milestone: 43
- Baseline: `d39fa480`
- Current issue: none

The user authorized the next repository-wide debt reduction on 2026-09-26 while
retaining every functional capability. Runtime behavior assembly currently
scans one ordered provider list eleven times, and low-level interceptor assembly
scans its ordered contribution list five times. This milestone replaces those
parallel scans with two explicit one-pass collectors while retaining exact
provider order, global/schema positioning, callback attribution, and optional
stage absence.

Issue 4301 replaced one materialization map and eleven stage-specific scans
with one explicit ordered behavior pass. It removes two production lines and,
more importantly, eleven redundant traversals without introducing a dynamic
stage registry.

Issue 4302 replaced five full interceptor filters with one explicit ordered
classification pass. It removes 11 production lines and adds focused coverage
for the required global/schema before-and-after execution order.

Issue 4303 completed the parity audit. Runtime stage planning now uses two
ordered passes instead of seventeen list traversals, removes 13 net production
lines, and preserves every capability and stage position. Full typecheck, 2,567
tests, lint, build, and 387 built E2E/PostgreSQL tests pass.

No push is authorized.
