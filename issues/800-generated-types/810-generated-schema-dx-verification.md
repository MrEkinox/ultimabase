# 810: Verify generated schema authoring DX and performance

- Status: planned
- Milestone: 8
- Packages: all milestone packages
- Depends on: 811
- ADR: [ADR-0173](../../docs/adr/0173-generated-schema-authoring.md)

## Goal

Audit the complete generated-schema authoring vertical for correctness,
editor quality, resource use, startup behavior, package consumption, and
application isolation before declaring the migration complete.

## Acceptance criteria

- [ ] A representative large-schema fixture records TypeScript process memory, typecheck duration, completion latency, and hover output before and after generated contracts.
- [ ] The result demonstrates whether generated named types materially reduce recursive inference cost; documentation reports measurements rather than promising a fixed memory reduction.
- [ ] Stable TypeScript source and packed-package consumers complete built-in and plugin field methods, schema fields, select, where, include, Access, hooks, and mutations exactly.
- [ ] Generated-contract tests prove that each schema's exact item type replaces `BaseItem`, while a no-Typegen fixture exposes only the documented bootstrap identity and unknown application fields.
- [ ] First generation through the public Typegen API, stale output, plugin installation/removal, clean checkout, and read-only consumption of committed declarations are verified end to end.
- [ ] Two applications and parallel workers retain isolated plugin method registries and schema graphs.
- [ ] Generated output is deterministic across operating-system paths and repeated clean runs.
- [ ] No Core dependency on a concrete plugin, infrastructure library, transport, database, or TypeScript compiler plugin was introduced.
- [ ] Remaining intentional limitations and later optimization candidates are documented without speculative APIs.
- [ ] The absence of automatic generation, watch mode, and startup verification is documented as deferred issue 808 rather than presented as current DX.

## Tests

- [ ] Repository typecheck, tests, lint, formatting, constraints, build, packed archives, and complete PostgreSQL E2E pass.
- [ ] The final handoff includes one realistic public API example and the recorded editor-performance evidence.
