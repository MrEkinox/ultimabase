---
'@ultimabase/password': minor
---

`password()` adds `passwordSetAt` to the user model: when the password was last set by `signUp`, `changePassword`, `resetPassword` or `User.setPassword`, read by the user and Master, `null` once the account closes (D-169). Run a migration after the upgrade.
