---
'ultimabase': patch
'@ultimabase/testing': patch
---

A nested `update`, `delete` or `connectOrCreate` on a list reads the rows its items name at once, where it read them one by one: 500 items take a third less time, and a `connectOrCreate` less than half. A unique index now types as the target of a nested write and of an include's `cursor`, as at the root.
