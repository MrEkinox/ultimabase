---
'@ultimabase/postgres': patch
---

A transaction's `BEGIN` no longer waits for its answer before the first statement, which takes a round trip off every write in a transaction: 12 to 22 % on PostgreSQL next door, 17 to 26 % at 2 ms. A database behind a pooler (`prepared: false`) keeps waiting.
