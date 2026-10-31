---
'@ultimabase/password': minor
---

`password()` adds `passwordSetAt` to the user model: when the password was last set by `signUp`, `changePassword`, `resetPassword` or `User.setPassword`, read by the user and Master, `null` once the account closes (D-169). With `sendEmail`, each change but the sign-up's sends a `'passwordChanged'` email to the account once it commits. Run a migration after the upgrade.
