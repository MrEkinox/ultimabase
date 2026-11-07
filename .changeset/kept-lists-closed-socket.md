---
'@ultimabase/graphql': patch
---

A closed WebSocket no longer keeps its completed live lists for 10 seconds: they end at once, as no resume can reach them. A storm of closing connections held about 24 KiB a socket until then.
