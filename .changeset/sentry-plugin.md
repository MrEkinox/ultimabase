---
'@ultimabase/sentry': minor
---

`@ultimabase/sentry` reads the kernel's tracing channels into the Sentry client the application initialized: each model operation, hook, virtual field and function is a span of its request's trace, nested, and each error the server masks is an issue tagged with its correlation id. A `NOT_FOUND` or a refused input marks its span failed and makes no issue.
