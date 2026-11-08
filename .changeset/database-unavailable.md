---
'ultimabase': minor
'@ultimabase/http': minor
'@ultimabase/postgres': minor
---

A database the server cannot use answers 503 `UNAVAILABLE` with `Retry-After: 1`, not 500 (D-335): every pool connection stayed busy, or the server cannot be reached. The reason is logged at `error`. `UNAVAILABLE` is now a kernel code.
