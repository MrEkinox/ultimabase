# 2320: Execute REST schema reads

- Status: planned
- Milestone: 23
- Packages: `@ultimabase/rest-plugin`, `@ultimabase/core`
- Depends on: 2304, 2307, 2319
- ADR: ADR-0004, ADR-0225 and the issue 2302 HTTP and REST contract

## Goal

Execute every accepted normalized REST read through the application-owned
Runtime and return its logical result to the shared REST response encoder.

## Acceptance criteria

- [ ] Find, get, count, and the accepted `first` and `exists` mappings execute
      through the Core request execution facade and existing schema handles.
- [ ] The route never accesses an adapter, database, Runtime pipeline, engine,
      or application object directly.
- [ ] Anonymous, plugin-valued session, and verified Master contexts retain
      their exact authority, identity, cancellation, and application provenance.
- [ ] Access operation, item, field, filter, order, and output decisions; ACL row
      constraints; inclusions; projections; and final structural snapshots match
      direct Query execution.
- [ ] Count and exists preserve their exact logical operations instead of being
      emulated through an item read that changes Access semantics.
- [ ] Missing strict targets preserve protected not-found behavior without
      revealing whether policy or persistence hid the object.
- [ ] Request cancellation and configured deadlines stop normalization,
      Runtime, inclusion, materialization, and response work through the same
      `AbortSignal`.
- [ ] No HTTP, URL, header, credential, or wire-only value enters the Query or
      Operation AST.

## Tests

- [ ] Direct-Query equivalence covers every accepted read, selection,
      inclusion, cursor, relation, pointer, Access, ACL, and failure shape.
- [ ] Anonymous, session-valued anonymous, Master, cancellation, deadline,
      application-isolation, packed-package, and PostgreSQL Testcontainers
      tests pass.

## Out of scope

- Mutations, custom plugin operations, response encoding, streaming, and
  transport-specific query operators.
