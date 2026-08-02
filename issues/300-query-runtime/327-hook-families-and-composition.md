# 327: Compose hook families and handler lists

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/core`, `@ultimabase/shared`
- Depends on: 325, 326
- ADR: ADR-0089

## Goal

Let developers reuse one hook across logical operation families and compose
several handlers without writing forwarding boilerplate.

## Acceptance criteria

- [ ] Direct phase handlers cover every operation supported by that phase.
- [ ] `create`, `update`, `upsert`, `delete`, `save`, and `find` families cover singular and bulk terminals without duplicate declarations.
- [ ] `beforeSave` and `afterSave` cover create, update, and upsert while preserving an exact terminal discriminant.
- [ ] One declaration accepts either one handler or an ordered readonly handler list.
- [ ] Transform output becomes the next transform input, validation issues aggregate, and effect handlers execute sequentially.
- [ ] Broad-to-specific before phases and specific-to-broad after phases preserve the nesting fixed by ADR-0089.
- [ ] Generic-plus-specific declarations have one readable, non-duplicating composition shape with deterministic order.
- [ ] Validation returns immutable structured issues and never mutates a collector.
- [ ] No numeric priority or hidden parallel execution is introduced.

## Tests

- [ ] Runtime sequencing, transformation chaining, issue aggregation, and failure-short-circuit tests.
- [ ] Compile-time direct-handler, family-map, terminal narrowing, and incompatible-handler tests.
- [ ] Hover fixtures keep the union of supported declaration forms readable.

## Out of scope

- Plugin dependency ordering.
- Database transaction execution.
