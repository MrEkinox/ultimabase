---
'@ultimabase/postgres': patch
---

A read outside a transaction tests a relation to one id, as `viewer: true` in a rule, on its key alone, which PostgreSQL plans faster. A read of 25 campaigns under rules holding seven such relations went from 3.5 to 2.9 ms.
