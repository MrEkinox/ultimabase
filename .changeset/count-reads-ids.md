---
'ultimabase': patch
---

`updateMany` and `deleteMany` read back only the ids of the rows they count: on 200000 rows, twice and three times as fast.
