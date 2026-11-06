---
'@ultimabase/postgres': minor
---

The adapter plans a statement it composes once per connection, where PostgreSQL planned it on every run. A pooler that shares server connections between clients may then find a statement unknown: PgBouncer in transaction mode needs version 1.21 or later and `max_prepared_statements` above 0. Where it cannot, `postgres({ url, prepared: false })` plans each statement every time.
