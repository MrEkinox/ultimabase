# 803: Compile deferred schema field declarations

- Status: done
- Milestone: 8
- Packages: `@ultimabase/core`
- Depends on: 802
- ADR: [ADR-0173](../../docs/adr/0173-generated-schema-authoring.md)

## Goal

Implement the accepted application schema-compilation phase that later
FieldBuilder and plugin-owned methods will use, without pulling issues 804 and
805 into this foundation.

## Acceptance criteria

- [x] `Schema.define()` accepts and retains one immutable `fields: () => fieldMap` callback rather than requiring its final field map during module evaluation.
- [x] Existing object-shaped field maps remain a documented migration-only compatibility path until issue 809.
- [x] Application static compilation resolves deferred schema callbacks before plugin setup or infrastructure lifecycle work.
- [x] Each field callback executes exactly once per accepted compilation boundary and produces one immutable deterministic field map.
- [x] Reusing one schema class across isolated applications follows the model and metadata semantics selected by the ADR without first-application leakage.
- [x] Indexes, extensions, Access, hooks, target resolution, validation plans, and schema hashes observe only the final frozen field map.
- [x] Plugin setup receives a read-only view of the already compiled schemas and cannot register a late schema.
- [x] The temporary callback contract cannot access adapters, requests, transactions, services, or infrastructure lifecycle state.

## Tests

- [x] Runtime tests cover ordering, callback count, immutability, compilation failures, repeated compilation, setup ordering, and two applications.
- [x] Type tests preserve the accepted unresolved and compiled schema boundaries without `any`.

Plugin-owned method registration, ownership conflicts, and missing-method
diagnostics remain in issue 805, after issue 804 introduces the canonical
FieldBuilder surface.

## Evidence

Core compiles deferred callbacks into one frozen application graph before
plugin setup, while setup sees the `CompiledSchemaRegistry` read-only contract.
Focused compilation and language-service tests cover the unresolved boundary,
atomic publication, compatible class reuse, circular targets, exact callback
inference, and editor documentation. Repository-wide typecheck, lint, build,
and unit/type tests pass.
