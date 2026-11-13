---
'@ultimabase/http': patch
---

`@hono/node-server` 2.1.6 fixes two advisories: a connection reset during a WebSocket upgrade no longer crashes the process, and a backslash in a request's path no longer passes a reverse proxy's path rules as a separator.
