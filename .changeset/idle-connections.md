---
'@ultimabase/postgres': patch
---

A quiet server keeps its database connections for 5 minutes instead of 10 s, so the first read after a pause takes 2.5 ms instead of 11.5 ms next door, and 5 ms instead of 22 ms at 2 ms. A script that forgets `app.stop()` now ends at once instead of 10 s later.
