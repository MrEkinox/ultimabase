---
'@ultimabase/graphql': patch
---

A model whose only fields are relations, or that has none, no longer breaks
the GraphQL schema: the inputs GraphQL cannot take are left out. A schema
that is still invalid refuses the start, and an error a request throws is
logged by the application's logger.
