---
'ultimabase': minor
'@ultimabase/graphql': minor
'@ultimabase/rest': minor
---

A query's `where` filters a single plugin field, a file field for instance, on its presence:
`{ attachment: null }` or `{ attachment: { not: null } }` (D-404). GraphQL types it as
`PresenceFilter`, and OpenAPI as the component of the same name.
