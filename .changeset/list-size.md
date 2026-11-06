---
'ultimabase': minor
'@ultimabase/postgres': minor
---

A list takes `size: { min, max }`, as a `many` does: `f.enumOf(Language, { list: true, size: { min: 1 } })`. The bound holds after the hooks, so a `beforeCreate` may fill the list, and on what `push` and `remove` leave. A write outside it fails with `VALIDATION_FAILED`. PostgreSQL enforces it too, with a check of its own, and the schemas state it in the field's description.
