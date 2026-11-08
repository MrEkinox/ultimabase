---
'ultimabase': minor
'@ultimabase/postgres': patch
---

A create or an update that references a row another transaction is updating no longer waits for that transaction: on PostgreSQL an update locks its rows with `FOR NO KEY UPDATE`, as PostgreSQL's own update does, and only a delete keeps `FOR UPDATE`. An adapter's `Read.lock` and `Check.lock` are now `'update'` or `'delete'`, the new type `Lock`, in place of `true`.
