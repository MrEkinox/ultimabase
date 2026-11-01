---
'@ultimabase/password': patch
---

`User.signIn` and `User.checkPassword` take a function's `client` as the function gets it, `undefined` from server code, under `exactOptionalPropertyTypes`.
