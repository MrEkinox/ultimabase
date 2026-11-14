---
'@ultimabase/http': patch
'@ultimabase/maintenance': patch
---

During maintenance, `PUT /_ultimabase/maintenance` passes the gate with the
master key or the maintenance key only: an application route matching that
path no longer runs for an anonymous caller. The HTTP plugin refuses to start
when an application route answers a plugin's path under `/_ultimabase/`.
