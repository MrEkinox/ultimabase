---
'@ultimabase/postgres': patch
---

On a test file's own schema, the change feed's listener connects alongside the pool: a 22-model application with realtime starts and stops around a test in 39 ms where it took 47 ms.
