---
'@ultimabase/testing': patch
'@ultimabase/password': patch
'ultimabase': patch
---

`asUser` takes the user's row as a sign-up or a Master read returns it, whose
read-ruled fields are optional, instead of refusing it (D-203). A user's
`email` and `passwordSetAt` are optional in the rows a read returns, since
only the user and Master read them; `ultimabase` exports `UserRowOf` and
`Hidden` for it.
