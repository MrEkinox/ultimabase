---
'@ultimabase/postgres': patch
---

Several `migrate deploy` at once no longer deadlock on a file that creates an index concurrently, which could leave that index invalid.
