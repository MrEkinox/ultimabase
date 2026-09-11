# Milestone 26 — Plugin-defined schema mutations and official soft delete

- Status: in-progress

Generalize application-owned model commands into exact plugin-defined schema
mutations that participate in the canonical Runtime, optional official Access
and Hooks engines, and generated REST and GraphQL surfaces. Then use that
generic foundation to deliver the first supported official soft-delete plugin.

## Execution order

1. [x] [2601 — Decide schema mutations and soft delete](2601-schema-mutation-soft-delete-contract.md)
2. [x] [2602 — Declare plugin-owned schema mutations](2602-schema-mutation-declarations.md)
3. [x] [2603 — Execute schema mutations through Runtime](2603-schema-mutation-runtime.md)
4. [x] [2604 — Extend Access for schema mutations](2604-schema-mutation-access.md)
5. [x] [2605 — Extend Hooks for schema mutations](2605-schema-mutation-hooks.md)
6. [x] [2606 — Expose schema mutations through REST](2606-schema-mutation-rest.md)
7. [x] [2607 — Expose schema mutations through GraphQL](2607-schema-mutation-graphql.md)
8. [x] [2615 — Select absent direct schema options](2615-schema-option-absence-selector.md)
9. [x] [2608 — Create the official soft-delete package](2608-soft-delete-package-contract.md)
10. [x] [2609 — Enforce tombstone visibility and writes](2609-soft-delete-visibility.md)
11. [x] [2610 — Implement replace-delete mode](2610-soft-delete-replace-mode.md)
12. [x] [2611 — Implement explicit soft delete](2611-soft-delete-explicit-mode.md)
13. [x] [2612 — Add restore and purge commands](2612-soft-delete-administration.md)
14. [ ] [2613 — Prove the public soft-delete vertical](2613-soft-delete-public-vertical.md)
15. [ ] [2614 — Audit and close official soft delete](2614-soft-delete-final-audit.md)

Issues 2604 and 2605 may proceed independently after 2603. Issues 2606 and
2607 may likewise proceed independently after 2603. Every later issue remains
single-owner and integrates only after its declared dependencies complete.

## Accepted contract

- `softDeletePlugin({ defaultMode })` accepts `disabled`, `replace-delete`, or
  `explicit`; an omitted schema option inherits that mode.
- A schema declares `softDelete: false | 'replace-delete' | 'explicit'` and has
  no place in a plugin-level schema list.
- Replace mode keeps logical delete semantics and rewrites only persistence.
- Explicit mode adds one logical schema mutation named `softDelete`; native
  update and delete policy or lifecycle callbacks do not impersonate it.
- The official Access and Hooks packages type and run custom operation keys only
  when installed. The soft-delete plugin depends only toward public foundations.
- REST and GraphQL derive a schema-local mutation when that schema is exposed.
- Protected visibility and write constraints work without Access or Hooks.
- Restore and purge remain audited Master-only application commands and are not
  transport endpoints.

## Stop boundaries

- ADR-0245 must fix the complete generic and product contract before issue 2602
  changes a public API.
- Core and transports never gain `softDelete`, `restore`, or `purge` vocabulary.
- A physical update cannot replay logical update Access or Hooks.
- No transport receives Runtime internals or a way to create Master authority.
- V1 does not anticipate configurable tombstone storage, deletion metadata,
  include-deleted queries, cascades, retention, jobs, or uniqueness reuse.

## Completion gate

The milestone closes only after direct TypeScript and JavaScript, Typegen,
packed packages, REST, networkless GraphQL, Yoga, and PostgreSQL prove both
modes through the same Runtime. The final gate includes Access, Hooks, protected
constraints, Master administration, rollback, relations, ordered itemized
delete batches, application isolation, documentation, coverage, and complete
repository validation.
