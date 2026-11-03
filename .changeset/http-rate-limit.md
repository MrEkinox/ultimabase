---
'@ultimabase/http': minor
'ultimabase': patch
---

`httpPlugin()` limits each client address to 600 requests and upgrades a
minute, answering 429 `TOO_MANY_ATTEMPTS` with `Retry-After` past it, before
any session is read (D-218). `rateLimit: { requests, window }` changes the
limit and `rateLimit: false` turns it off. An IPv6 address counts by its /64;
a local or private address is never counted; the master key passes.
