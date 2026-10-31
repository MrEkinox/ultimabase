---
'@ultimabase/auth': minor
'@ultimabase/password': minor
'ultimabase': patch
---

`signedInRun(run)` gives a function's `run` the signed-in `user`, typed, and refuses anyone else with `UNAUTHENTICATED`. password's signed-in functions use it: their message is now `This function needs a signed-in user.`
