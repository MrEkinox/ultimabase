---
'ultimabase': patch
---

A delete that runs hooks or a cascade no longer slows down with the square of its rows: `deleteMany` of 20000 rows with a `beforeDelete` hook takes 0.3 s instead of 3.1 s.
