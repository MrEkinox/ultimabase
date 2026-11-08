---
'ultimabase': minor
'@ultimabase/http': minor
'@ultimabase/postgres': minor
---

A database the server cannot use answers `UNAVAILABLE`, not `INTERNAL` (D-335): every pool connection stayed busy, or the server cannot be reached. REST answers it with 503 and `Retry-After: 1`. GraphQL, as for every error, answers HTTP 200 with the code in `errors[].extensions.code` and `extensions.details.retryAfter`: a client that retries from the HTTP status reads the code instead. The reason is logged at `error`. `UNAVAILABLE` is now a kernel code.
