---
'@ultimabase/graphql': patch
---

`maxDepth` counts no field of a connection or an edge, so `posts { edges { node { comments { edges { node { body } } } } } }` is 3 levels deep instead of 7; a relation or a virtual selected twice with different arguments, aliases and fragments included, is refused as the document is validated, naming both paths, before a query, a mutation or a subscription runs.
