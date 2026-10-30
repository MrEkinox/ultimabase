---
'@ultimabase/auth': minor
---

`authPlugin({ sessions: { lifetime, longest } })` sets how long sessions last, in milliseconds: 30 days after the last use and 365 days after the sign-in by default (D-165). A session is renewed with less than half its lifetime left. The session cookie's `Max-Age` is now the longest, 365 days by default instead of 400.
