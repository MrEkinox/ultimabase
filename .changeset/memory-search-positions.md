---
'ultimabase': patch
---

`memory()` searches a long row in milliseconds, and finds and ranks it as PostgreSQL does: a word keeps its first 255 positions, none past 16,383. A row of 80,000 words took 15 s to filter and 42 s to rank.
