---
'@ultimabase/auth': patch
---

`signOut` with a Bearer also ends the session of the cookie the request
carries, before clearing it. `isOwner` is `false` when the facts carry
neither a record nor a value, as a function's do, instead of letting every
signed-in user in.
