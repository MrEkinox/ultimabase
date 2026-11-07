---
'@ultimabase/graphql': patch
---

A WebSocket client's invalid or oversized frame closes its own socket, with the code for it, and no longer stops the server.
