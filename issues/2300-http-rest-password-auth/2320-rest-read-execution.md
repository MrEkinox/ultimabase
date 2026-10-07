# 2320: Execute REST schema reads

- Status: completed
- Milestone: 23
- Packages: `@ultimabase/rest-plugin`, `@ultimabase/core`
- Depends on: 2304, 2307, 2319
- ADR: ADR-0004, ADR-0225, ADR-0228, ADR-0230, and ADR-0231

## Goal

Execute every accepted normalized REST read through the application-owned
Runtime and return its logical result to the shared REST response encoder.

## Acceptance criteria

- [x] Find, get, count, and the accepted `first` and `exists` mappings execute
      through the Core request execution facade and existing schema handles.
- [x] The route never accesses an adapter, database, Runtime pipeline, engine,
      or application object directly.
- [x] Anonymous, plugin-valued session, and verified Master contexts retain
      their exact authority, identity, cancellation, and application provenance.
- [x] Access operation, item, field, filter, order, and output decisions; ACL row
      constraints; inclusions; projections; and final structural snapshots match
      direct Query execution.
- [x] Count and exists preserve their exact logical operations instead of being
      emulated through an item read that changes Access semantics.
- [x] Missing strict targets preserve protected not-found behavior without
      revealing whether policy or persistence hid the object.
- [x] Request cancellation and configured deadlines stop normalization,
      Runtime, inclusion, materialization, and response work through the same
      `AbortSignal`.
- [x] No HTTP, URL, header, credential, or wire-only value enters the Query or
      Operation AST.

## Tests

- [x] Direct-Query equivalence covers every accepted read, selection,
      inclusion, offset, relation, pointer, Access, ACL, and failure shape.
- [x] Anonymous, session-valued anonymous, Master, cancellation, deadline,
      application-isolation, packed-package, and PostgreSQL Testcontainers
      tests pass.

## Out of scope

- Mutations, custom plugin operations, response encoding, streaming, and
  transport-specific query operators.
