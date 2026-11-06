---
'@ultimabase/postgres': patch
---

A read builds its rows as `json`, and no longer numbers them: a nested list of 25 rows costs PostgreSQL about 20 % less time, a list of 50 000 rows about 46 % less time and memory.
