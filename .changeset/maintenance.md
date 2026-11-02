---
'@ultimabase/maintenance': minor
'@ultimabase/http': minor
---

New package, `@ultimabase/maintenance`: `maintenancePlugin()` answers 503
`MAINTENANCE`, with `Retry-After`, to every request and WebSocket upgrade
but Master's, and closes the open sockets with 1012, while the maintenance
is on. `PUT /_ultimabase/maintenance { enabled }`, with the master key or
the `key` option sent in `x-ultimabase-maintenance-key`, turns it on and
off, and so do `plugins.maintenance.lock()` and `unlock()`; every server
follows the stored state, or `initial` while none is stored, and a start
that cannot read it fails (D-207). `/health` and `/ready` are left
alone. Plugins add their own gates with `plugins.http.gate(gate)`, run on
each request past CORS and on each upgrade (D-205).
