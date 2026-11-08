---
'@ultimabase/postgres': minor
---

`postgres({ url, statementTimeout: 10_000 })` ends a statement that runs longer than 10 s, a wait for a lock included, and gives up a connection whose statement has no answer 10 s past it, with or without realtime. Migrations run unbounded. Unset, nothing changes.
