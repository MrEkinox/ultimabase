---
'ultimabase': patch
---

`memory()` reads a one-to-many relation through an index instead of scanning the whole related table for each row: an `include`, a `_count` or a `some` on 1,000 rows of 10,000 related ones took 180 ms; now under 25 ms.
