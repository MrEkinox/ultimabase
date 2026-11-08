---
'@ultimabase/postgres': patch
---

Updates of distinct rows by id that set no unique, partial-index or relation key share one statement, where each ran its own: a nested `update` of 500 items takes 59 % less time.
