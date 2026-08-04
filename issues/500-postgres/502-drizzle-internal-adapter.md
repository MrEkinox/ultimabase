# 502: Add internal Drizzle adapter

- Status: done
- Milestone: 5
- Packages: `@ultimabase/postgres-plugin`
- Depends on: 501
- ADR: ADR-0007

## Goal

Wrap Drizzle around the `pg` pool without exposing Drizzle publicly.

## Acceptance criteria

- [x] Drizzle imports remain inside the package.
- [x] Public exports contain no Drizzle types.
- [x] Existing and transactional clients satisfy internal contracts.

## Tests

- [x] Public declaration inspection and query smoke test.

## Validation

- A parameterized Drizzle query executes through the package's narrow internal
  query-client contract.
- Compile-time tests prove both `pg.Pool` and `pg.PoolClient` satisfy that
  contract.
- The built public declaration contains no Drizzle or concrete `pg` imports,
  while plugin setup registers Runtime's portable database-adapter service.
- CRUD and Runtime transaction methods fail explicitly until issues 507 and 508
  implement them.
