# @ultimabase/auth

## 0.8.0

### Patch Changes

- Updated dependencies [20aec1b]
- Updated dependencies [b2aa312]
- Updated dependencies [94145f9]
- Updated dependencies [8f82820]
- Updated dependencies [1b9515a]
- Updated dependencies [458361b]
- Updated dependencies [4c9e506]
- Updated dependencies [51f8f04]
- Updated dependencies [3099475]
- Updated dependencies [1520a09]
  - ultimabase@0.8.0
  - @ultimabase/http@0.8.0

## 0.7.0

### Patch Changes

- ae007a2: A sign-in or sign-out sent over a GraphQL WebSocket fails without ending or opening a session, and auth's API gives sign-in methods `selfOrMaster`, the check password's user commands now share.
- 1f34e7a: Over a GraphQL WebSocket, `signUp`, `signIn` and `changePassword` are refused with `BAD_REQUEST` before anything is written: a sign-up no longer creates its user, nor a password change its password, then fails at the cookie. `client.cookies.settable` says whether a cookie can be set, and auth's API gives `needsCookies(client)` to refuse the same way.
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
- Updated dependencies [1f34e7a]
  - ultimabase@0.7.0
  - @ultimabase/http@0.7.0

## 0.6.0

### Minor Changes

- 778bbbc: A plugin's own model relates to the application's user model through `AppUser`: `user: f.one(() => AppUser, { onDelete: 'cascade' })`. Startup resolves it to the model `defineUser` declares, and the user model gains no field. Auth's sessions and linked accounts, and password's hash and tokens, now hold their user this way, and the column `user_id` becomes a `uuid` with a foreign key to the user. Deleting a user through UltimaBase deletes them in its transaction. The foreign key does not cascade, since the kernel runs the cascades (D-54): a delete in raw SQL deletes them first, or fails at commit. Before `migrate deploy`, delete the rows whose user no longer exists, or the cast to `uuid` and the foreign key fail; with the user model stored in `"user"`:

  ```sql
  delete from "auth_session" as "row" where not exists (select from "user" where "user"."id"::text = "row"."user_id");
  delete from "auth_account" as "row" where not exists (select from "user" where "user"."id"::text = "row"."user_id");
  delete from "password_hash" as "row" where not exists (select from "user" where "user"."id"::text = "row"."user_id");
  delete from "password_token" as "row" where not exists (select from "user" where "user"."id"::text = "row"."user_id");
  ```

- 2bccedd: A request with a known session token reads neither its session nor its user: each process keeps the caller of up to 10 000 tokens. A revocation, a sign-out, a user updated or deleted count from the next request, on every server through the change feed, which every application with auth now takes. A write that bypasses the application, as raw SQL, is not seen until the session is due for renewal.

### Patch Changes

- ce7e68f: A live viewer ends again when its session is revoked or its user is deleted, and is rebuilt when one of its roles is taken away, though a request with the same token came first (D-343). Since the caller cache, a viewer built on a kept caller recorded no read and stayed open until its refresh, 300 s by default.
- Updated dependencies [e97378e]
- Updated dependencies [778bbbc]
- Updated dependencies [2bccedd]
- Updated dependencies [f808da8]
- Updated dependencies [a47bbc4]
- Updated dependencies [7c20553]
- Updated dependencies [2f1baf1]
- Updated dependencies [945b1b3]
- Updated dependencies [4ff9d42]
- Updated dependencies [41b5dca]
- Updated dependencies [3d7f654]
- Updated dependencies [703ed93]
- Updated dependencies [76509c3]
- Updated dependencies [a6394ba]
- Updated dependencies [41b5dca]
- Updated dependencies [41b5dca]
- Updated dependencies [ce7e68f]
- Updated dependencies [d6ec5d4]
- Updated dependencies [0a6de4d]
- Updated dependencies [1644bb1]
- Updated dependencies [dfa430e]
- Updated dependencies [12edcfd]
- Updated dependencies [a479bca]
- Updated dependencies [0102aa8]
- Updated dependencies [7a8d0d8]
- Updated dependencies [e3d051f]
- Updated dependencies [6140b2b]
- Updated dependencies [0699e37]
  - ultimabase@0.6.0
  - @ultimabase/http@0.6.0

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
