---
'ultimabase': patch
---

`memory()` checks unique keys on the rows a write changed only: a create on a table of 40,000 rows with a unique field took 13 ms, now 1.5 ms.
