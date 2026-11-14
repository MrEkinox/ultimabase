---
'@ultimabase/postgres': patch
---

A PostgreSQL server that refuses a connection now answers 503 `UNAVAILABLE` with `retryAfter: 1`, as a full pool already did: too many clients (53300), out of resources (53400), a server still starting or shutting down (57P03), and a connection cut while it opened. Before, these answered 500. Any other refusal, such as a wrong password, still answers 500 (D-396).
