# Current plan: Runtime stage-plan simplification

- Status: in progress
- Milestone: 43
- Baseline: `d39fa480`
- Current issue: 4302

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

No push is authorized.
