---
'ultimabase': minor
'@ultimabase/postgres': minor
'@ultimabase/testing': minor
---

A unique index takes `where`, a filter of values, `null`, `equals` and
`not` on the model's scalar fields: the rows it keeps share no values, the
others are never in conflict. `postgres()` creates a partial unique index,
and `memory()` checks the same rows. `where: { deletedAt: null }` lets a
new row take the unique value of a soft-deleted one (D-215).
