---
'@ultimabase/rest': minor
---

`GET /api/openapi.json` answers 404 in production, as GraphQL's introspection is closed there. `restPlugin({ openapi: true })` serves it anyway; `openapi: false` hides it everywhere.
