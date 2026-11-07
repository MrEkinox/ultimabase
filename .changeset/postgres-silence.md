---
'@ultimabase/postgres': patch
---

A database that goes silent with no one told, as after a failover to a new address, no longer freezes realtime and waiting requests until a restart: within about 20 s they fail, a warning says so, and realtime comes back.
