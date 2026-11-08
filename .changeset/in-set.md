---
'ultimabase': patch
---

`memory()` finds a value in a long `in` list without comparing it with every item, so `updateMany` and `deleteMany` on a model with hooks no longer slow down with the square of their rows.
