---
'@ultimabase/graphql': patch
---

A WebSocket subscription id used twice closes the socket with 4409 however long the id is, and no longer logs an error.
