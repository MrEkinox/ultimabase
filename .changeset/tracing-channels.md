---
'ultimabase': minor
'@ultimabase/graphql': patch
'@ultimabase/http': patch
'@ultimabase/jobs': patch
'@ultimabase/maintenance': patch
'@ultimabase/password': patch
'@ultimabase/postgres': patch
'@ultimabase/realtime': patch
'@ultimabase/rest': patch
---

The kernel publishes each model operation, hook, virtual field and function on Node's tracing channels `ultimabase:operation`, `ultimabase:hook`, `ultimabase:virtual` and `ultimabase:function`, nested, and each error the server logs at error level on `ultimabase:error` with its correlation id. A tool such as an error tracker subscribes to them; without a subscriber, nothing is built.
