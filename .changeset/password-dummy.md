---
'@ultimabase/password': patch
---

A sign-in with an unknown email no longer answers `TOO_MANY_ATTEMPTS` for good after the server was once too busy to hash, which told the emails that have an account from those that do not.
