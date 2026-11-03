---
'@ultimabase/postgres': patch
---

A `check` constraint of the application's own that refuses a row returns
`VALIDATION_FAILED`, one issue naming the constraint, instead of `INTERNAL`
(D-219).
