---
'@ultimabase/postgres': patch
---

A read from a cursor starts at its row when an index serves its order, so paging through 100 000 rows takes 1.7 s instead of 25.8 s; results do not change.
