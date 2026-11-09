---
'@ultimabase/graphql': patch
---

A document that returns more than 50 values a row of `maxRows`, 1,000,000 by default, is refused before it runs: "The document returns more than 1,000,000 values. Select fewer fields, aliases or rows." Each field counts once per row above it, so 120,000 aliases of `title` over 100 posts no longer make the server read 12,000,000 values. A live row over a WebSocket counts its values too. Master is not counted.
