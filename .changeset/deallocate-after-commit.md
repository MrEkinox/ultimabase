---
'@ultimabase/postgres': patch
---

A connection past its 500 prepared statements no longer aborts the transaction it is in, behind a pooler in transaction mode such as PgBouncer: it deallocates the statements it dropped after the transaction's end, and gives up on a name the server does not know instead of trying it again on every query.
