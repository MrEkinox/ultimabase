# @ultimabase/password

## 0.3.0

### Minor Changes

- 876b414: `password()` adds `passwordSetAt` to the user model: when the password was last set by `signUp`, `changePassword`, `resetPassword` or `User.setPassword`, read by the user and Master, `null` once the account closes (D-169). With `sendEmail`, each change but the sign-up's sends a `'passwordChanged'` email to the account once it commits. Run a migration after the upgrade.
- b1bc387: `signedInRun(run)` gives a function's `run` the signed-in `user`, typed, and refuses anyone else with `UNAUTHENTICATED`. password's signed-in functions use it: their message is now `This function needs a signed-in user.`

### Patch Changes

- 0f13ad3: Requests at once keep one pending token of each kind per user, as a new one replaces the older. A unique index on `PasswordToken` (`userId`, `kind`) enforces it: run a migration after the upgrade.
- Updated dependencies [41cfff6]
- Updated dependencies [7530d07]
- Updated dependencies [6e8ebf6]
- Updated dependencies [760560a]
- Updated dependencies [21b52bc]
- Updated dependencies [134d951]
- Updated dependencies [bc4d6de]
- Updated dependencies [9cd2dd4]
- Updated dependencies [f33c16f]
- Updated dependencies [8ce42f6]
- Updated dependencies [b1bc387]
- Updated dependencies [353c2bf]
- Updated dependencies [aaf123c]
  - ultimabase@0.3.0
  - @ultimabase/auth@0.3.0

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
