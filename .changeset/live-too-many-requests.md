---
'@ultimabase/live': patch
---

`liveFetch` reconnects after a 429, once the `retry-after` the server sends has passed, then the usual backoff. Before, a live list refused for too many requests stopped for good with `TOO_MANY_ATTEMPTS`, though the server answers "try again later".
