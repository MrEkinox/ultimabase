# @ultimabase/auth

## 0.6.0

### Patch Changes

- Updated dependencies [a47bbc4]
- Updated dependencies [41b5dca]
- Updated dependencies [41b5dca]
- Updated dependencies [41b5dca]
  - @ultimabase/http@0.6.0
  - ultimabase@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [20e2cc5]
- Updated dependencies [efc5f10]
- Updated dependencies [fa67fd3]
- Updated dependencies [3646c66]
- Updated dependencies [9e34dc6]
- Updated dependencies [05cc9ce]
  - ultimabase@0.5.0
  - @ultimabase/http@0.5.0

## 0.4.0

### Minor Changes

- 957bb20: `User.closeAccount` and `AuthApi.onCloseAccount` are removed (D-211): delete
  the user instead, which ends its sessions, unlinks its accounts and deletes
  its password, so the email signs up again. `email: null` on a user with a
  password account is refused with `email: A password account keeps its
email.`
- 1a5c324: `isOwner(field)` works in a model read rule: it keeps the rows whose `one` relation `field` is the caller, and none for a visitor. It combines with `anyOf` and `allOf` (D-241).

### Patch Changes

- 957bb20: `signOut` with a Bearer also ends the session of the cookie the request
  carries, before clearing it. `isOwner` is `false` when the facts carry
  neither a record nor a value, as a function's do, instead of letting every
  signed-in user in.
- 1d7fda8: `ultimabase` exports `QueryOptions`, the `{ as }` every query, model command
  and `fn.run` take; auth, files and password use it instead of their own
  copies.
- 6c1cfe5: A model's `create`, `update`, `delete` or `write` rule may return
  `where(filter, error?)`, as a read rule does (D-214). An update's row matches
  the filter before and after the write, a delete's before, a create's after,
  with the relations it connects or creates; a row outside it refuses the whole
  write with the given `PublicError`, or `ACCESS_DENIED`. `isOwner` still tells
  a read rule from a write rule now that both receive `where`.
- Updated dependencies [67d5152]
- Updated dependencies [9c6ca70]
- Updated dependencies [4c2d462]
- Updated dependencies [7accc26]
- Updated dependencies [783fc4b]
- Updated dependencies [f38d1fb]
- Updated dependencies [8dca2cf]
- Updated dependencies [4fba06b]
- Updated dependencies [4e1a966]
- Updated dependencies [6e7d759]
- Updated dependencies [e4c1252]
- Updated dependencies [11b7633]
- Updated dependencies [6f37f70]
- Updated dependencies [9b491fb]
- Updated dependencies [9b491fb]
- Updated dependencies [9cebf63]
- Updated dependencies [b65eb74]
- Updated dependencies [1354efd]
- Updated dependencies [b994e6e]
- Updated dependencies [fb807e1]
- Updated dependencies [69699b2]
- Updated dependencies [4b37376]
- Updated dependencies [d76e882]
- Updated dependencies [ebdf8a0]
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
  - @ultimabase/http@0.4.0

## 0.3.0

### Minor Changes

- b1bc387: `signedInRun(run)` gives a function's `run` the signed-in `user`, typed, and refuses anyone else with `UNAUTHENTICATED`. password's signed-in functions use it: their message is now `This function needs a signed-in user.`
- a7588c3: `viewer: true` on a relation to the user model filters by the signed-in user, in server code, access rules, GraphQL and REST; `false` keeps the other rows, and a caller with no user matches no row with `true` (D-189).

### Patch Changes

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
- Updated dependencies [2eb7b9d]
- Updated dependencies [a7588c3]
- Updated dependencies [aaf123c]
- Updated dependencies [714d3bb]
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
