---
'ultimabase': minor
'@ultimabase/graphql': minor
'@ultimabase/rest': minor
---

`f.exists(target, { from })` declares a read-only boolean: whether the view
of that `many`, filtered in `.with({ relations })`, keeps a row for the
caller. `select` and `include` take `true`, and `where` takes `true` or
`false`; it sorts nothing, is not counted and is not written. GraphQL reads a
`Boolean!` and filters on a `Boolean`; REST and OpenAPI read and filter a
`boolean` (D-246).
