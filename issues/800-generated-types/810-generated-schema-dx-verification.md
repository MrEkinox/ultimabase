# 810: Verify generated schema authoring DX and performance

- Status: planned
- Milestone: 8
- Packages: all milestone packages
- Depends on: 809
- ADR: issue 802 ADR

## Goal

Audit the complete generated-schema authoring vertical for correctness,
editor quality, resource use, startup behavior, package consumption, and
application isolation before declaring the migration complete.

## Acceptance criteria

- [ ] A representative large-schema fixture records TypeScript process memory, typecheck duration, completion latency, and hover output before and after generated contracts.
- [ ] The result demonstrates whether generated named types materially reduce recursive inference cost; documentation reports measurements rather than promising a fixed memory reduction.
- [ ] Stable TypeScript source and packed-package consumers complete built-in and plugin field methods, schema fields, select, where, include, Access, hooks, and mutations exactly.
- [ ] First generation, watch regeneration, stale output, plugin installation/removal, startup regeneration, clean checkout, and read-only deployment paths are verified end to end.
- [ ] Two applications and parallel workers retain isolated plugin method registries and schema graphs.
- [ ] Generated output is deterministic across operating-system paths and repeated clean runs.
- [ ] No Core dependency on a concrete plugin, infrastructure library, transport, database, or TypeScript compiler plugin was introduced.
- [ ] Remaining intentional limitations and later optimization candidates are documented without speculative APIs.

## Tests

- [ ] Repository typecheck, tests, lint, formatting, constraints, build, packed archives, and complete PostgreSQL E2E pass.
- [ ] The final handoff includes one realistic public API example and the recorded editor-performance evidence.
