---
'ultimabase': minor
---

A `one` relation read through `include` or `select` is typed `Target | null`, required relations included: it reads `null` when a read rule hides its target or the target is soft-deleted, which the type did not say. Code that reads such a relation now handles `null`, as in `message.author?.name`.
