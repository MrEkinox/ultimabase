# 327: Compose hook families and handler lists

- Status: done
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 325, 326
- ADR: ADR-0089

## Goal

Let developers reuse one hook across logical operation families and compose
several handlers without writing forwarding boilerplate.

## Acceptance criteria

- [x] Direct phase handlers cover every operation supported by that phase.
- [x] `create`, `update`, `upsert`, `delete`, and `find` family branches plus save-wide phases cover singular and bulk terminals without duplicate declarations.
- [x] `beforeSave` and `afterSave` cover create, update, and upsert while preserving an exact terminal discriminant.
- [x] One declaration accepts either one handler or an ordered readonly handler list.
- [x] Transform output becomes the next transform input, validation issues aggregate, and effect handlers execute sequentially.
- [x] Broad-to-specific before phases and specific-to-broad after phases preserve the nesting fixed by ADR-0089.
- [x] Generic-plus-specific declarations have one readable, non-duplicating composition shape with deterministic order.
- [x] Validation returns immutable structured issues and never mutates a collector.
- [x] No numeric priority or hidden parallel execution is introduced.

## Tests

- [x] Runtime sequencing, transformation chaining, issue aggregation, and failure-short-circuit tests.
- [x] Compile-time direct-handler, family-map, terminal narrowing, and incompatible-handler tests.
- [x] Hover fixtures keep the union of supported declaration forms readable.

## Out of scope

- Plugin dependency ordering.
- Database transaction execution.

## Result

Every native phase accepts a direct handler or non-empty ordered list. Broad
phases additionally accept `all` plus compatible logical family branches, where
one family still covers singular and bulk terminals. Declarations are copied,
frozen, and precomposed once; Runtime helpers preserve sequential transforms,
validation aggregation, effect ordering, and failure short-circuiting without
adding priorities or implicit parallelism.
