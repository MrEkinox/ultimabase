# ADR-0137: Drizzle-native PostgreSQL relation compilation

- Status: accepted
- Date: 2026-08-05
- Refines: ADR-0063, ADR-0079, ADR-0118

## Context

UltimaBase owns a portable relationship graph because Schema, Query, Access,
hooks, transports, and database adapters must agree on one logical contract.
The PostgreSQL adapter previously reproduced relation correlation itself with
manually oriented joins, aliases, subqueries, and `EXISTS` expressions.

Drizzle v1 Relational Queries v2 now supports explicit `one` and `many`
relations, direct many-to-many traversal through a junction table, inverse
orientation, nested relation filters, and correlated SQL generation. Retaining
a parallel PostgreSQL implementation for capabilities Drizzle already provides
would increase maintenance and version-migration work without strengthening an
UltimaBase invariant.

## Decision

The resolved Core `SchemaTargetGraph` remains the sole logical source of truth.
During PostgreSQL catalog compilation, the adapter generates one private
Drizzle `defineRelations` graph from the already compiled tables, pointer
columns, and hidden junction tables. Developers never declare or receive this
graph.

Every root and transaction-scoped Drizzle client receives the generated
relation definitions. PostgreSQL delegates relation orientation, junction
traversal, correlation aliases, and relation-filter SQL to Drizzle RQB v2.
Generated reverse names are private adapter metadata used when a relation handle
queries from the physical target side; they never enter Schema, Query, models,
or transports.

UltimaBase continues to compile its portable Query AST and policy-neutral
constraints. For relation predicates, it injects the target developer predicate
and accumulated Access constraints through Drizzle's raw-filter boundary, while
Drizzle owns the relational join topology. `some`, `none`, and `every` retain
the empty-relation and visible-target semantics accepted by ADR-0118.

Physical foreign keys, hidden junction-table DDL, relation mutations, Runtime
transactions, hooks, and output restrictions remain adapter or Runtime work;
`defineRelations` does not provide those guarantees. New custom PostgreSQL
relation SQL is allowed only after the current Drizzle API has been checked and
a concrete missing capability is documented.

## Consequences

- Core remains independent from Drizzle and PostgreSQL.
- One generated mapping connects the portable relationship graph to Drizzle;
  there is no second developer-authored relation declaration.
- Drizzle upgrades own changes to relation joins and aliases instead of forcing
  UltimaBase to maintain parallel SQL construction.
- Access and Query semantics remain explicit and testable at the adapter
  boundary rather than being delegated to an opaque nested-loading shortcut.
- PostgreSQL integration tests protect owning, inverse, pointer, nested,
  self-referential, and quantified relation behavior against Drizzle changes.
