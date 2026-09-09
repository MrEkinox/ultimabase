# 2508: Expose virtual fields through REST

- Status: completed
- Milestone: 25
- Packages: `@ultimabase/rest-plugin`
- Depends on: 2507
- ADR: [ADR-0244](../../docs/adr/0244-contextual-fields-and-virtual-results.md)

## Goal

Expose Core virtual fields through the existing REST result-selection and
response codec contract without adding them to request inputs or filters.

## Acceptance criteria

- [x] REST route metadata advertises virtual fields as response-only values with
      their exact output descriptors.
- [x] Existing REST `select` normalization can request or exclude a virtual field
      and delegates the unchanged logical selection through the application
      request executor.
- [x] Complete REST results include virtual fields while create, patch, upsert,
      nested-write, filter, order, and relationship inputs reject them.
- [x] Primitive, enum, temporal, decimal, binary, JSON, nullable, list, and object
      virtual values use the existing canonical response encodings.
- [x] Async rejection, invalid output, cancellation, Access denial, and resolver
      failure cross the existing REST safe error boundary without leaking source
      dependencies or internal details.
- [x] REST contains no resolver execution, persistence projection, permission,
      transaction, or adapter behavior.

## Tests

- [x] Route, query, response, error, Fetch, authenticated-context, Master, and
      nested-mutation response tests cover virtual values.
- [x] Typegen-free JavaScript and packed REST tests prove the same wire behavior.

## Completion evidence

- REST schema routes publish immutable response-only virtual output descriptors;
  resolver functions and private dependency selections remain inside Core.
  Plugin-owned output kinds without an exact REST representation fail route
  compilation instead of receiving an invented or lossy wire encoding.
- Existing REST selection normalization now accepts virtual result fields while
  persisted-only lookup continues to reject them in filters, ordering,
  relationship traversal, create, patch, upsert, and nested-write payloads.
- The response codec covers every built-in output descriptor through REST's
  existing canonical scalar, list, nullable, and recursive object encodings.
- Fetch tests prove anonymous, authenticated request context, Master provenance,
  cancellation, safe resolver failures, invalid output, and input rejection.
  PostgreSQL tests prove Access denial and nested mutation result projection.
- The Typegen-free packed application exposes an asynchronous object virtual
  field and returns the same canonical REST wire representation.
- `yarn typecheck`, `yarn test` (461 files and 2,213 tests), `yarn lint`,
  `yarn build`, `yarn constraints`, `yarn format:check`, and `git diff --check`
  passed. Lint reports only the repository's existing file-size warnings; no
  baseline increased.

## Out of scope

- A REST-only virtual syntax, virtual filters/order, response caching, or OpenAPI.
