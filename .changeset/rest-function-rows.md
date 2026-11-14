---
'@ultimabase/rest': patch
---

A function's output counts against `maxRows` over REST as it does over GraphQL: one row for a
model or a type, `take` rows for a list, its mutations included. A function returning a list no
longer passes a `maxRows` lower than `take`.
