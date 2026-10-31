---
'@ultimabase/graphql': patch
'@ultimabase/realtime': minor
---

A query or mutation sent over the GraphQL socket reads its caller again before it runs, as over HTTP; when it is another user, the socket closes with `4403`. `Viewer.identify()` reads a viewer's caller again (D-178).
