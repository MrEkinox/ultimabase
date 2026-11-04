---
'ultimabase': minor
---

A `one` view's filter can pin a relation to the user model with
`viewer: true`, at its top level: each signed-in user reads their own row,
and a visitor and Master read `null`. A unique index on the target's key and
the pinned relations holds the row single; startup refuses `viewer: false`
and a `viewer` inside `OR`, `NOT` or a nested relation (D-245).
