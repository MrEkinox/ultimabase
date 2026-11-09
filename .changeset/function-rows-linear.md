---
'@ultimabase/rest': patch
---

A function returning many rows of a model with a default virtual answers in time linear in its rows: 20,000 rows took 1.5 s, now 0.12 s. Each model's default row shape is built once.
