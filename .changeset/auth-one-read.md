---
'@ultimabase/auth': patch
---

Requests with one session token at once share one read of the session and the user, instead of each reading both.
