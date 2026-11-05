# @ultimabase/password

## 0.5.0

### Patch Changes

- Updated dependencies [20e2cc5]
- Updated dependencies [efc5f10]
- Updated dependencies [fa67fd3]
- Updated dependencies [3646c66]
- Updated dependencies [9e34dc6]
- Updated dependencies [05cc9ce]
  - ultimabase@0.5.0
  - @ultimabase/auth@0.5.0

## 0.4.0

### Minor Changes

- 215832f: `passwordPlugin({ breached: true })` refuses a new password that appears in
  a known data breach, asking Have I Been Pwned with the first 5 characters
  of its SHA-1; it is off by default, accepts the password when the service
  does not answer within 2 seconds, asks nothing under `NODE_ENV=test`, and a
  production start without the option warns. A new password equal to the
  account's email, or to its local part, is refused. A refused reset keeps
  its link (D-209).
- 957bb20: `User.closeAccount` and `AuthApi.onCloseAccount` are removed (D-211): delete
  the user instead, which ends its sessions, unlinks its accounts and deletes
  its password, so the email signs up again. `email: null` on a user with a
  password account is refused with `email: A password account keeps its
email.`
- 3f23551: The email flows are commands on the user model for server code and tests:
  `User.requestPasswordReset({ email })`, `User.resetPassword({ token, password })`,
  `User.verifyEmail({ token })`, `User.sendVerificationEmail({ id })`,
  `User.requestEmailChange({ id, newEmail })` and
  `User.confirmEmailChange({ token })`. Each runs its function's code and
  resolves once the email has left.

### Patch Changes

- 67d5152: `asUser` takes the user's row as a sign-up or a Master read returns it, whose
  read-ruled fields are optional, instead of refusing it (D-203). A user's
  `email` and `passwordSetAt` are optional in the rows a read returns, since
  only the user and Master read them; `ultimabase` exports `UserRowOf` and
  `Hidden` for it.
- e61e1c2: `requestEmailChange` refuses a taken email with the details of a sign-up,
  `{ model: 'User', fields: ['email'] }`.
- 11b7633: `IssueCodeOf<typeof app>` types the codes the plugins give a
  `VALIDATION_FAILED` issue, which a plugin declares in its types' `issues`.
  The password plugin declares `PASSWORD_LENGTH`, `PASSWORD_IS_EMAIL` and
  `PASSWORD_BREACHED` (D-231).
- 6f37f70: A schema's issue keeps its code when it is in capitals, as `NAME_LENGTH`;
  a library's, as Zod's `too_small`, is left out. The password's refusals
  carry `PASSWORD_LENGTH`, `PASSWORD_IS_EMAIL` and `PASSWORD_BREACHED`, and
  within a function they share the input's path, as
  `['input', 'newPassword']` (D-224).
- 6bbea47: A new password deletes the pending email-change link, a reset or verification link sent to an email the account has left fails, and a sign-in that raced `setPassword` inside an application's transaction ends once it commits (D-212).
- 1d7fda8: `ultimabase` exports `QueryOptions`, the `{ as }` every query, model command
  and `fn.run` take; auth, files and password use it instead of their own
  copies.
- Updated dependencies [67d5152]
- Updated dependencies [957bb20]
- Updated dependencies [4c2d462]
- Updated dependencies [7accc26]
- Updated dependencies [783fc4b]
- Updated dependencies [f38d1fb]
- Updated dependencies [8dca2cf]
- Updated dependencies [4e1a966]
- Updated dependencies [e4c1252]
- Updated dependencies [11b7633]
- Updated dependencies [6f37f70]
- Updated dependencies [9b491fb]
- Updated dependencies [9b491fb]
- Updated dependencies [b65eb74]
- Updated dependencies [1354efd]
- Updated dependencies [b994e6e]
- Updated dependencies [fb807e1]
- Updated dependencies [69699b2]
- Updated dependencies [957bb20]
- Updated dependencies [4b37376]
- Updated dependencies [d76e882]
- Updated dependencies [ebdf8a0]
- Updated dependencies [1a5c324]
- Updated dependencies [b5c22b0]
- Updated dependencies [1d7fda8]
- Updated dependencies [a778695]
- Updated dependencies [adafb1a]
- Updated dependencies [2afc370]
- Updated dependencies [e61e1c2]
- Updated dependencies [844627a]
- Updated dependencies [eb6dbbf]
- Updated dependencies [c9a8228]
- Updated dependencies [501c0cb]
- Updated dependencies [644a24f]
- Updated dependencies [efc4303]
- Updated dependencies [6c1cfe5]
  - ultimabase@0.4.0
  - @ultimabase/auth@0.4.0

## 0.3.0

### Minor Changes

- 876b414: `password()` adds `passwordSetAt` to the user model: when the password was last set by `signUp`, `changePassword`, `resetPassword` or `User.setPassword`, read by the user and Master, `null` once the account closes (D-169). With `sendEmail`, each change but the sign-up's sends a `'passwordChanged'` email to the account once it commits. Run a migration after the upgrade.
- b1bc387: `signedInRun(run)` gives a function's `run` the signed-in `user`, typed, and refuses anyone else with `UNAUTHENTICATED`. password's signed-in functions use it: their message is now `This function needs a signed-in user.`

### Patch Changes

- f84ae27: `User.signIn` and `User.checkPassword` take a function's `client` as the function gets it, `undefined` from server code, under `exactOptionalPropertyTypes`.
- 0f13ad3: Requests at once keep one pending token of each kind per user, as a new one replaces the older. A unique index on `PasswordToken` (`userId`, `kind`) enforces it: run a migration after the upgrade.
- Updated dependencies [41cfff6]
- Updated dependencies [7530d07]
- Updated dependencies [6e8ebf6]
- Updated dependencies [760560a]
- Updated dependencies [21b52bc]
- Updated dependencies [134d951]
- Updated dependencies [1195207]
- Updated dependencies [bc4d6de]
- Updated dependencies [9cd2dd4]
- Updated dependencies [f33c16f]
- Updated dependencies [b06627c]
- Updated dependencies [8ce42f6]
- Updated dependencies [b1bc387]
- Updated dependencies [353c2bf]
- Updated dependencies [a7588c3]
- Updated dependencies [aaf123c]
- Updated dependencies [714d3bb]
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
