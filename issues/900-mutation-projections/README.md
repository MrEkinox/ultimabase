# Milestone 9 — Mutation relationship projections

- Status: completed

Allow create and update commands to return the same exact nested relationship
projections as reads without replaying root Access or hooks. Singular commands
perform one transaction-bound result read, while itemized collection commands
project all persisted identities as one ordered batch.

The milestone preserves the existing mutation lifecycle: hooks and Access remain
item-oriented, generated contracts remain the public typing source, and database
plugins continue consuming the portable Query and inclusion plans.

## Execution order

1. [901 — Decide mutation relationship projection semantics](901-mutation-relationship-projection-adr.md)
2. [902 — Project singular create and update results](902-singular-mutation-includes.md)
3. [903 — Group collection mutation projections](903-grouped-mutation-includes.md)
4. [904 — Verify generated and PostgreSQL mutation include DX](904-mutation-includes-verification.md)

The completed constraints and validation evidence live in the
[archived milestone plan](../../docs/plans/completed/mutation-relationship-projections.md).
