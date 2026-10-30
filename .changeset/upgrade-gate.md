---
'@ultimabase/http': minor
'@ultimabase/graphql': minor
---

`httpPlugin({ upgrade })` refuses WebSocket upgrades with a response, as
during maintenance, and `closeUpgrades({ code, reason })` closes the sockets
open: GraphQL's with that code, those of a plugin without `close` cut (D-166).
