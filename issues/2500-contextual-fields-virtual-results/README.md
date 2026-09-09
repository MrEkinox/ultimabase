# Milestone 25 — Contextual fields and virtual results

- Status: in-progress

Make field declaration autocomplete truthful for stored roots, embedded object
properties, and output-only values, then deliver selectable request-aware
virtual fields without inventing persistence or mutation behavior.

## Execution order

1. [x] [2501 — Decide contextual fields and virtual results](2501-contextual-field-virtual-contract.md)
2. [x] [2502 — Restrict embedded built-in field declarations](2502-embedded-field-contracts.md)
3. [x] [2503 — Add output-only value descriptors](2503-output-value-descriptors.md)
4. [ ] [2504 — Contextualize plugin field declarations and Typegen](2504-contextual-plugin-field-typegen.md)
5. [ ] [2505 — Compile virtual schema fields](2505-virtual-field-schema-typegen.md)
6. [ ] [2506 — Resolve asynchronous virtual fields](2506-virtual-field-runtime.md)
7. [ ] [2507 — Integrate virtual projections with PostgreSQL](2507-postgres-virtual-projections.md)
8. [ ] [2508 — Expose virtual fields through REST](2508-rest-virtual-fields.md)
9. [ ] [2509 — Expose virtual fields through GraphQL](2509-graphql-virtual-fields.md)
10. [ ] [2510 — Prove the public virtual-field vertical](2510-virtual-field-public-vertical.md)
11. [ ] [2511 — Audit and close contextual virtual fields](2511-contextual-virtual-final-audit.md)

## Candidate contract

- Stored root, embedded, virtual, and output declarations expose distinct
  capability profiles through context-specific builders and Runtime checks.
- Embedded object fields keep familiar value factories but lose suggestions
  for behavior that cannot execute at an embedded path.
- Output descriptors use an `OutputBuilder` with value shape, nullability,
  lists, documentation, and kind-specific representation metadata only.
- `field.virtual({ output, select, resolve })` remains in the schema field map.
- `select` reuses Core's flat boolean syntax and privately loads persisted
  dependencies when the virtual field is requested.
- `resolve({ item, context })` may return its declared value or a Promise and
  never receives a Runtime, Query, adapter, authority grant, or transport.
- Typegen emits exact result, selection, and resolver declarations while
  mutation inputs, filters, ordering, and storage contracts omit virtuals.

## Stop boundaries

- ADR-0244 must fix the complete syntax, capability profiles, plugin
  participation, async execution, security, projection, and transport contract
  before implementation begins.
- Context restrictions reject invalid declarations instead of ignoring options
  or relying on one database provider to fail late.
- Virtual fields do not restore field `resolveOutput`, add a second Hooks
  lifecycle, execute through GraphQL-only resolvers, or become generated
  database columns.
- V1 has no virtual dependencies, relation traversal, filter/order pushdown,
  cross-request cache, side-effect contract, or public DataLoader abstraction.

## Completion gate

The milestone closes only after source and generated TypeScript, Typegen-free
JavaScript, REST, networkless GraphQL, Yoga, packed packages, and PostgreSQL
Testcontainers prove identical virtual result semantics. The final gate audits
contextual autocomplete, stale/untyped declaration rejection, private
dependency projection, Access, async cancellation and failure, transaction
rollback, output validation, concurrency bounds, application isolation,
documentation, coverage, and complete repository validation.
