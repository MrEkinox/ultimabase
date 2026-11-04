---
'@ultimabase/postgres': patch
---

A relation has no index of its own when a unique key or an index of its model starts with its column; the next sync or migration drops the extra one (D-234).
