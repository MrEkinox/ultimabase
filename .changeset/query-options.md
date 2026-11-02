---
'ultimabase': minor
'@ultimabase/auth': patch
'@ultimabase/files': patch
'@ultimabase/password': patch
---

`ultimabase` exports `QueryOptions`, the `{ as }` every query, model command
and `fn.run` take; auth, files and password use it instead of their own
copies.
