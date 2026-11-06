---
'@ultimabase/http': patch
'@ultimabase/graphql': patch
'@ultimabase/realtime': patch
'@ultimabase/live': patch
---

A storm of connections no longer fails. The server's connection queue holds 4096, and at most 8 connections open at once. A socket closed by a failure of the server now gets `1013`, which `graphql-ws` retries, where it got `4403`: `4403` now means refused, and only that. `liveFetch` reconnects at a random moment of its wait, so that clients cut together do not come back together.
