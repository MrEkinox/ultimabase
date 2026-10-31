---
'ultimabase': minor
---

`ultimabase dev`, `sync`, `reset` and `migrate create` load the `.env` file beside the config; `start`, `migrate deploy` and `migrate status` never read it (D-171).
