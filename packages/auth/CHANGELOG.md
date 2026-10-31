# @ultimabase/auth

## 0.3.0

### Minor Changes

- b1bc387: `signedInRun(run)` gives a function's `run` the signed-in `user`, typed, and refuses anyone else with `UNAUTHENTICATED`. password's signed-in functions use it: their message is now `This function needs a signed-in user.`

### Patch Changes

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
- Updated dependencies [2eb7b9d]
- Updated dependencies [aaf123c]
  - ultimabase@0.3.0
  - @ultimabase/http@0.3.0

## 0.2.0

### Minor Changes

- fcca799: `User.closeAccount({ id }, { as })` closes an account and keeps its row: it ends the user's sessions, unlinks their accounts, and runs the listeners sign-in methods register with `AuthApi.onCloseAccount`. password's deletes the hash, the tokens and the email requests, and sets `emailVerified` to `false`, so the email signs up again.
- 99cdfec: `password()` adds a unique `email` field to the user model, which the user and Master read and only Master writes; the password account follows it. `requestEmailChange` and `confirmEmailChange` change the email from a link sent to the new address, and `sendEmail` tells the old one with an `'emailChanged'` email. `AuthApi.unlinkAccount` unlinks one method's account.

  Breaking: `Email` is a union, so read `token` after checking `kind`; a user model that declares its own `email` stops startup; users stored before this release read `email: null` until a Master `User.update({ where: { id }, data: { email } })` writes their account's email.

- fd1263e: A plugin's context gives `dependents`, the plugins that require it, and auth warns at start when no sign-in method requires it (D-164).
- 6d4f980: `authPlugin({ sessions: { lifetime, longest } })` sets how long sessions last, in milliseconds: 30 days after the last use and 365 days after the sign-in by default (D-165). A session is renewed with less than half its lifetime left. The session cookie's `Max-Age` is now the longest, 365 days by default instead of 400.

### Patch Changes

- Updated dependencies [2c3bf4e]
- Updated dependencies [fd1263e]
  - ultimabase@0.2.0
  - @ultimabase/http@0.2.0

## 0.1.2

### Patch Changes

- @ultimabase/http@0.1.2
  - ultimabase@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies
  - ultimabase@0.1.1
  - @ultimabase/http@0.1.1

## 0.1.0

### Minor Changes

- 0e885c4: The first release: the kernel, its adapters, transports and plugins, the testing helpers and the starter.

### Patch Changes

- Updated dependencies [0e885c4]
  - @ultimabase/http@0.1.0
  - ultimabase@0.1.0
