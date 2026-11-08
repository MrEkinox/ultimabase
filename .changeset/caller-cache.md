---
'@ultimabase/auth': minor
---

A request with a known session token reads neither its session nor its user: each process keeps the caller of up to 10 000 tokens. A revocation, a sign-out, a user updated or deleted count from the next request, on every server through the change feed, which every application with auth now takes. A write that bypasses the application, as raw SQL, is not seen until the session is due for renewal.
