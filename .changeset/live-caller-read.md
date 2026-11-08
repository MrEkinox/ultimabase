---
'ultimabase': patch
'@ultimabase/auth': patch
---

A live viewer ends again when its session is revoked or its user is deleted, and is rebuilt when one of its roles is taken away, though a request with the same token came first (D-343). Since the caller cache, a viewer built on a kept caller recorded no read and stayed open until its refresh, 300 s by default.
