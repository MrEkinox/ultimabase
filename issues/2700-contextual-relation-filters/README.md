# Milestone 27 — Contextual relation filters

- Status: in-progress

Add one Core-owned `where` option to relation fields so a relation can define a
static or request-contextual visible read subset. The filter composes with
caller predicates, policy, protected constraints, and physical membership
through the canonical Runtime instead of becoming Drizzle-specific behavior.

## Execution order

1. [x] [2701 — Decide contextual relation filters](2701-contextual-relation-filter-contract.md)
2. [x] [2702 — Declare typed relation filters](2702-relation-filter-declarations.md)
3. [x] [2703 — Resolve filters for relation reads](2703-relation-filter-runtime.md)
4. [x] [2704 — Filter eager relation inclusions](2704-relation-filter-inclusions.md)
5. [ ] [2705 — Filter relation predicates and cardinality](2705-relation-filter-predicates.md)
6. [ ] [2706 — Prove public relation-filter parity](2706-relation-filter-public-vertical.md)
7. [ ] [2707 — Audit and close contextual relation filters](2707-relation-filter-final-audit.md)

Issues remain sequential because each later surface must reuse the exact
normalization and Runtime semantics established by its dependency rather than
implementing a parallel filter path.

## Accepted contract

- `field.relation({ target, where })` accepts a target-typed static filter or a
  synchronous function of `{ context, where }`.
- The callback receives the exact request context and an immutable target
  `WhereBuilder`; it receives no source object or infrastructure capability.
- Core combines the relation filter and caller filter with logical `AND` before
  target policy and protected constraints reach the adapter.
- Relation handles, eager inclusions, transport relation projections and
  connections, predicates, emptiness, and cardinality observe the same visible
  subset.
- Master retains the filter unless the callback explicitly branches on its
  authority mode.
- Membership mutations and nested writes continue to address physical edges and
  do not inherit read shaping.
- The contract is adapter-neutral and executes without generated files.

## Stop boundaries

- ADR-0247 must fix evaluation order, visible-membership semantics, callback
  ownership, recursion limits, Master behavior, and write exclusions before
  issue 2702 changes a public API.
- Relation shaping must never be documented or enforced as authorization.
- Core and transports must not import or expose Drizzle-specific relation APIs.
- V1 does not anticipate source-item inputs, asynchronous filters, public bypass
  flags, relation-write filtering, schema-root default filters, or persistent
  query caches.

## Completion gate

The milestone closes only after direct TypeScript and JavaScript, Typegen,
packed packages, REST, networkless GraphQL, Yoga, PostgreSQL, Access, ACL,
Master, nested traversal, recursion limits, application isolation, and complete
repository validation prove one contract. The final audit must also confirm
that relation writes and pointer behavior remain unchanged.
