---
'ultimabase': minor
'create-ultimabase': patch
---

`ultimabase dev`, `sync`, `reset`, `migrate create` and `generate` also load the `.env.local` beside the config, whose values win over the `.env`'s; a variable already set still wins over both. The starter's `.gitignore` lists `.env.local`.
