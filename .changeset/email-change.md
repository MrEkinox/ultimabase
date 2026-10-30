---
'@ultimabase/auth': minor
'@ultimabase/password': minor
---

`password()` adds a unique `email` field to the user model, which the user and Master read and only Master writes; the password account follows it. `requestEmailChange` and `confirmEmailChange` change the email from a link sent to the new address, and `sendEmail` tells the old one with an `'emailChanged'` email. `AuthApi.unlinkAccount` unlinks one method's account.

Breaking: `Email` is a union, so read `token` after checking `kind`; a user model that declares its own `email` stops startup; users stored before this release read `email: null` until a Master `User.update({ where: { id }, data: { email } })` writes their account's email.
