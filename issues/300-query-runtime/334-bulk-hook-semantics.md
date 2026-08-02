# 334: Define bulk hook and non-atomic grouping semantics

- Status: planned
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 316, 329, 330
- ADR: ADR-0069, ADR-0089

## Goal

Preserve true bulk performance while making item, operation, transaction, and
partial-success hook behavior explicit.

## Acceptance criteria

- [ ] Create-many and upsert-many run item and field value hooks in stable input order.
- [ ] One operation-level before/after hook wraps the complete bulk terminal.
- [ ] Atomic collections share one transaction and release post-commit work only after the collection commits.
- [ ] `{ atomic: false }` never separates one item's hooks from that item's persistence.
- [ ] Non-atomic stopping, result, error, and post-commit delivery semantics are explicit and reflected in public types.
- [ ] Set-based update-many and delete-many execute hooks once around the adapter statement and never silently materialize matching rows.
- [ ] Per-object update/delete behavior is deferred to the explicit itemized terminals in issue 336.
- [ ] Operation summaries expose only data already promised by each terminal result contract.

## Tests

- [ ] Ordered item, atomic rollback, non-atomic partial completion, and post-commit timing tests.
- [ ] Set-based adapter-call-count tests prohibit hidden row loading.
- [ ] Compile-time tests cover any refined non-atomic result or error contract.

## Out of scope

- Implementing the itemized terminals from issue 336.
