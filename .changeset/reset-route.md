---
'ultimabase': minor
'@ultimabase/http': minor
'@ultimabase/postgres': minor
'@ultimabase/testing': minor
---

Outside production, `POST /_ultimabase/reset` with the master key empties every model's rows and keeps the tables, for end-to-end tests; an adapter gains a required `empty()`, which the contract suite checks (D-188).
