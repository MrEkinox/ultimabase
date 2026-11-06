---
'@ultimabase/http': patch
---

A request costs up to 18 % less CPU: the server keeps its light response through CORS, the body limit and its headers. `Access-Control-Allow-Credentials` goes out only with an allowed origin, and a route's own `Vary` is kept.
