---
'ultimabase': minor
'@ultimabase/auth': minor
'@ultimabase/graphql': minor
'@ultimabase/rest': minor
---

`viewer: true` on a relation to the user model filters by the signed-in user, in server code, access rules, GraphQL and REST; `false` keeps the other rows, and a caller with no user matches no row with `true` (D-189).
