# Current plan: native contribution-first plugin plan

- Status: in-progress

The user authorized the internal alignment on 2026-09-25 after milestone 34's
audit showed that the public contribution-first form still translated through
Core's older phase-bucket definition compiler.

Work through [milestone 35](issues/3500-native-contribution-plugin-plan/README.md)
in order. Make contributions Core's native immutable plugin plan, compile and
validate every fact once, and let the lifecycle manager own application
resources directly. Preserve every current plugin capability, option,
privilege, lifecycle, transport, Typegen, schema, private-storage, Runtime, and
cleanup behavior.

Each issue receives focused runtime and type tests, one dedicated local commit,
and a documentation-impact classification. The final state keeps one public
`plugin()` factory and has no internal phase bridge. Do not push without a
separate request.
