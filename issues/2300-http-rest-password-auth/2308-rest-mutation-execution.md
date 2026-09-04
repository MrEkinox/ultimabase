# 2308: Execute REST schema mutations

- Status: planned
- Milestone: 23
- Packages: `@ultimabase/rest-plugin`, `@ultimabase/core`
- Depends on: 2304, 2306, 2307
- ADR: ADR-0004 and the issue 2302 REST contract

## Goal

Normalize REST create, update, delete, upsert, and itemized bulk requests into
existing logical operations and execute them through the application-owned
Runtime pipeline.

## Acceptance criteria

- [ ] Every route delegates through public schema or application operation
      handles and never accesses an adapter or database directly.
- [ ] Create, update, delete, upsert, and bulk inputs reuse exact Core mutation,
      target, selection, inclusion, and update-expression normalization.
- [ ] Mutation bodies enforce the accepted media type and streaming size limit
      before JSON parsing, including missing, incorrect, and chunked
      `Content-Length` cases.
- [ ] System, immutable, generated, relation, pointer, embedded object, list,
      and plugin-defined field contracts match direct application execution.
- [ ] Access, ACL, Hooks, Validation, protected constraints, transactions,
      persistence rewrites, results, and events observe the same logical
      operation as non-transport callers.
- [ ] Public bulk requests execute ordered itemized singular operations with the
      accepted atomic semantics and never introduce partial success or public
      set-based hook behavior.
- [ ] Master bypasses authorization only and does not bypass validation, hooks,
      transactions, database constraints, or integrity maintenance.
- [ ] Cancellation and request deadlines propagate through Runtime and owned
      resources without leaking work after response termination.

## Tests

- [ ] Operation-equivalence tests cover every mutation and failure boundary for
      anonymous and Master contexts.
- [ ] Focused PostgreSQL integration tests prove transaction and itemized bulk
      semantics without transport-specific SQL.

## Out of scope

- Custom plugin operations, response formatting, authentication products, file
  upload, or set-based public mutation APIs.
