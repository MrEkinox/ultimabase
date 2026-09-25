# Current plan: native contribution-first plugin plan

- Status: completed

The user authorized the internal alignment on 2026-09-25 after milestone 34's
audit showed that the public contribution-first form still translated through
Core's older phase-bucket definition compiler.

Milestone 35 is complete. Contributions are Core's native immutable plugin
plan, each operation and normalized graph fact is compiled once, and the
lifecycle manager owns application resources directly. Every current plugin
capability, option, privilege, lifecycle, transport, Typegen, schema,
private-storage, Runtime, and cleanup behavior remains covered.

The final state keeps one public `plugin()` factory and has no internal phase
bridge. The complete reduction and parity report is recorded in issue 3502. No
push was performed.
