---
'@ultimabase/auth': minor
---

A signed-in caller carries `caller.session`, the `{ id }` of the session its token opened, and
`undefined` for a caller built in server code, as `asUser` (D-407). `plugins.auth.liveSessions(ids)`
returns the ids still live, so a plugin that keeps something per device, as push notifications,
drops what a sign-out, a revocation or an expiry left behind.
