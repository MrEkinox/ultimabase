---
'@ultimabase/files': patch
---

A file's `id` is an `ID` in GraphQL, as every id, and `{ type: 'string', format: 'uuid' }` in OpenAPI: it was a `String`. A client passing a file's id in a variable declares `$id: ID!`.
