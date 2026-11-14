---
'@ultimabase/http': patch
---

An idle connection is kept 65 s, past a load balancer's 60 s, which no longer answers `502` on a connection the server just closed. A request's body arrives within 120 s, not 300, and a socket quiet for 120 s is closed. A connection that turns idle once the stop began is closed at once, rather than holding the stop.
