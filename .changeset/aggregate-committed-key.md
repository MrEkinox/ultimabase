---
'@ultimabase/postgres': patch
---

An aggregate outside a transaction tests a stored key's target with one id on the key itself, as `findMany` and `count` do (D-320): PostgreSQL plans it without an `exists` per relation.
