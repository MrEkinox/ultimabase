---
'@ultimabase/http': patch
---

A request still running when `stop` begins is answered before any plugin stops: an upload, or a sign-up that sends its welcome email, no longer fails because the plugin it uses stopped first. Live streams and WebSockets still end with their plugin's `stop`, and the whole stop still takes 10 seconds at most (D-395).
