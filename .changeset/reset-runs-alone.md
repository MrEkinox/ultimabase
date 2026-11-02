---
'ultimabase': patch
---

`POST /_ultimabase/reset` no longer fails with `deadlock detected` when a
request writes while it runs: it waits for the running requests and holds
new ones until the database is empty, and fails after 5 seconds rather than
waiting forever.
