# @ultimabase/password

## 0.2.0

### Minor Changes

- f3a1fac: `User.checkPassword({ id, password }, { as, client })` checks the current password before a sensitive action, opens no session, and is counted per user even without a client. A wrong current password, here and in `changePassword`, now answers `Wrong password.`
- fcca799: `User.closeAccount({ id }, { as })` closes an account and keeps its row: it ends the user's sessions, unlinks their accounts, and runs the listeners sign-in methods register with `AuthApi.onCloseAccount`. password's deletes the hash, the tokens and the email requests, and sets `emailVerified` to `false`, so the email signs up again.
- 99cdfec: `password()` adds a unique `email` field to the user model, which the user and Master read and only Master writes; the password account follows it. `requestEmailChange` and `confirmEmailChange` change the email from a link sent to the new address, and `sendEmail` tells the old one with an `'emailChanged'` email. `AuthApi.unlinkAccount` unlinks one method's account.

  Breaking: `Email` is a union, so read `token` after checking `kind`; a user model that declares its own `email` stops startup; users stored before this release read `email: null` until a Master `User.update({ where: { id }, data: { email } })` writes their account's email.

### Patch Changes

- Updated dependencies [fcca799]
- Updated dependencies [99cdfec]
- Updated dependencies [2c3bf4e]
- Updated dependencies [fd1263e]
- Updated dependencies [6d4f980]
  - @ultimabase/auth@0.2.0
  - ultimabase@0.2.0

## 0.1.2

### Patch Changes

- @ultimabase/auth@0.1.2
  - ultimabase@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies
  - ultimabase@0.1.1
  - @ultimabase/auth@0.1.1

## 0.1.0

### Minor Changes

- 0e885c4: The first release: the kernel, its adapters, transports and plugins, the testing helpers and the starter.

### Patch Changes

- Updated dependencies [0e885c4]
  - @ultimabase/auth@0.1.0
  - ultimabase@0.1.0
