# ADR-0140: Flat boolean Query selections

- Status: accepted
- Date: 2026-08-05
- Refines: ADR-0055, ADR-0067, ADR-0074

## Context

Query selection originally accepted a variadic list of field names. That form
expressed inclusion but could not omit a small number of fields without listing
every retained field. It also diverged from the object-shaped projection model
developers already use with Drizzle and that future transports can represent
without positional arguments.

Relation selection will eventually require a nested contract, but that work is
not yet specified. Adding it with the flat migration would widen the public API
without a proven runtime or transport design.

## Decision

`Query.select` accepts one flat immutable object whose schema field keys map to
literal boolean flags. The object replaces the previous projection rather than
merging with it.

When at least one flag is `true`, selection uses inclusion mode and retains only
fields marked `true`. `false` flags do not add behavior in inclusion mode. When
every supplied flag is `false`, selection uses exclusion mode and retains every
schema field except the named fields. An empty object preserves the canonical
empty AST selection, which means the complete visible object.

The public TypeScript result type follows the same rule. Dynamic widened
`boolean` flags are rejected because one result type cannot precisely describe
both runtime modes. Developers may reuse a literal object with `satisfies
QuerySelection<typeof Schema>` when they want a separately declared selection.

Normalization validates plain-object input, schema field names, and boolean
values before producing the existing ordered `QuerySelectionNode`. The AST and
adapter contracts remain unchanged. An exclusion that removes every schema
field is rejected because the existing empty AST node means select all.

This decision does not add nested keys. Pointer loading and target projections
continue to use `include(field, targetQuery => targetQuery.select(...))`.

## Consequences

- Developers can express compact inclusion and exclusion projections with one
  schema-completed object.
- TypeScript results expose only statically selected fields.
- REST, GraphQL, Runtime, Access, and database adapters retain the existing
  transport-neutral selection AST.
- Repeated `select` calls are deterministic replacements rather than additive
  merges.
- Nested relation selection and dynamic conditional flags require separate
  designs before becoming public API.
