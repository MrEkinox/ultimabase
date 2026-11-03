---
'@ultimabase/rest': patch
'@ultimabase/graphql': patch
---

A live read whose client stops reading drops every message until the client
drains, then sends its state once: a row or a value no longer goes past the
full buffer, and a drain is waited for once (D-154). Over REST, a `where`
key `__proto__` is refused as an unknown key instead of losing the filter,
and `DELETE` answers the row without its virtuals, as GraphQL's
`DeletedPost`, with a `DeletedPost` schema in the OpenAPI document (D-107).
