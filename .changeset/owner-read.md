---
'@ultimabase/auth': minor
---

`isOwner(field)` works in a model read rule: it keeps the rows whose `one` relation `field` is the caller, and none for a visitor. It combines with `anyOf` and `allOf` (D-241).
