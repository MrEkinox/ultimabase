---
'@ultimabase/graphql': minor
---

`z.uuid()` is an `ID` in GraphQL, as a row's `id`, so a client passes a row's id to a function as `$id: ID!` (D-175). A client that declared `$id: String!` for such an argument declares `$id: ID!`.
