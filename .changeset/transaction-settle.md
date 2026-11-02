---
'ultimabase': patch
---

A transaction rolls back or commits only once every query in it has settled
(D-208): a query that fails beside others of a `Promise.all` no longer sends
`ROLLBACK` while they still wait on the connection, which `pg` warned of.
A query the callback does not wait for belongs to the transaction from its
call.
