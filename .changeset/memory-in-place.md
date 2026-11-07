---
'ultimabase': patch
---

A `memory()` write costs what it changes, no longer every row stored: one create with 100 000 rows stored takes 0.24 ms, where it took 14 ms, and a seed of 10 000 single creates 0.4 s, where it took 17 s. A read, update or delete by id tests only the rows it names. A failed write still changes nothing.
