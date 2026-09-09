# 2508: Expose virtual fields through REST

- Status: planned
- Milestone: 25
- Packages: `@ultimabase/rest-plugin`
- Depends on: 2507
- ADR: [ADR-0244](../../docs/adr/0244-contextual-fields-and-virtual-results.md)

## Goal

Expose Core virtual fields through the existing REST result-selection and
response codec contract without adding them to request inputs or filters.

## Acceptance criteria

- [ ] REST route metadata advertises virtual fields as response-only values with
      their exact output descriptors.
- [ ] Existing REST `select` normalization can request or exclude a virtual field
      and delegates the unchanged logical selection through the application
      request executor.
- [ ] Complete REST results include virtual fields while create, patch, upsert,
      nested-write, filter, order, and relationship inputs reject them.
- [ ] Primitive, enum, temporal, decimal, binary, JSON, nullable, list, and object
      virtual values use the existing canonical response encodings.
- [ ] Async rejection, invalid output, cancellation, Access denial, and resolver
      failure cross the existing REST safe error boundary without leaking source
      dependencies or internal details.
- [ ] REST contains no resolver execution, persistence projection, permission,
      transaction, or adapter behavior.

## Tests

- [ ] Route, query, response, error, Fetch, authenticated-context, Master, and
      nested-mutation response tests cover virtual values.
- [ ] Typegen-free JavaScript and packed REST tests prove the same wire behavior.

## Out of scope

- A REST-only virtual syntax, virtual filters/order, response caching, or OpenAPI.
