---
'@ultimabase/http': patch
---

A client that has not sent all its headers 10 s after it connected is disconnected, instead of 60 s: a slow client holds a socket for less time.
