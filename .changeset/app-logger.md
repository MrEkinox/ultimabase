---
'ultimabase': minor
'@ultimabase/http': minor
'@ultimabase/jobs': minor
---

The application's code logs with the application's logger, its lines named `app` (D-364): a function's `run` receives `logger`, bound to `{ function: name }`; each hook receives `logger`; a route reads `c.var.logger`; a job's `run` receives `logger`, bound to `{ job: name, run: id }`.
