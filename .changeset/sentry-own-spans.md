---
'@ultimabase/sentry': patch
---

Outside a trace, such as in a job or a timer, a span the application starts inside a function, hook or query is sent again: the plugin no longer makes its own unsampled span the active one. Errors-only setups also stop cloning a Sentry scope for each operation and hook.
