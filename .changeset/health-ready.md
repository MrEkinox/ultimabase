---
'ultimabase': minor
'@ultimabase/http': minor
---

`httpPlugin` answers `GET /health` and `GET /ready`, before every route.
`/ready` answers 503 until every plugin started, once the stop began, and
while a check a plugin added with `plugins.http.ready(check)` fails. On
`stop`, the server keeps serving for `drain` milliseconds, 5000 in
production, before the plugins stop. Plugins get two hooks: `started`, once
every plugin started, and `stopping`, before any plugin stops (D-204).
