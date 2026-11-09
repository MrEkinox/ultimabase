---
'@ultimabase/password': patch
---

`requestEmailChange` is refused past 10 requests per address and hour, as `signUp` is: a signed-in account can no longer test without limit which emails have an account.
