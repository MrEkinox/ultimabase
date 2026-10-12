# @ultimabase/auth-plugin

The authentication foundation of UltimaBase (ADR-0326): the User schema,
sessions shared by every sign-in method, the current principal, linked
accounts, attempt limiting, account events and the authentication routes
under one HTTP prefix. Sign-in methods are separate packages, such as
[`@ultimabase/auth-password`](../auth-password/README.md); they depend on the
foundation and never on each other.

```ts
import { accessPlugin } from '@ultimabase/access-plugin'
import { password } from '@ultimabase/auth-password'
import { authPlugin } from '@ultimabase/auth-plugin'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

export const App = UltimaBase.use(
	postgresPlugin(),
	accessPlugin(),
	authPlugin({ methods: [password({ identifier: 'email' })] }),
)

// One User schema per authPlugin instance; any class name.
export const TodoUser = App.UserSchema.define({
	className: 'TodoUser',
	fields: (field) => ({ displayName: field.string({ required: true }) }),
}).with({
	access: {
		read: ({ principal, where }) =>
			where.in('id', principal === undefined ? [] : [principal.id]),
	},
})

export const ultimabase = new App({ schemas: [TodoUser] })
await ultimabase.start()

const { user, session } = await TodoUser.signUp({
	displayName: 'Ada',
	email: 'ada@example.com',
	password: 'correct horse battery staple',
})
// `user` is `Model<'TodoUser'>`; `session.token` is returned exactly once.
```

## The User schema

`App.UserSchema.define({ className, fields })` declares the application's
User like any form D schema: it ends with `.with({ access, hooks, … })` and its
Access, Hooks and transport rules are the application's. The installed methods
add their fields (`password({ identifier: 'email' })` adds a unique `email`);
`password` and the methods' fields are reserved. The class gains static
members: `current()`, `refresh(token)`, `logout(token)`,
`logoutEverywhere()`, `listSessions()`, `revokeSession(id)`, `listMethods()`,
`unlinkMethod(id)`, `deleteAccount()`, plus each method's (`signUp`, `login`,
`changePassword`, `reauthenticate` for passwords). Their results are typed
with the User model.

The User schema belongs to the `authPlugin` instance whose `App` declared it:
an application installing that User installs that same instance. Applications
are started one at a time with it.

When a method owns the User's `email` (`password({ identifier: 'email' })`),
the foundation adds `emailVerified` (`false` by default) and
`emailVerifiedAt`. Only the authentication flows write these three fields:
creates keep the defaults, updates never name them, Master included
(`VALIDATION_ERROR` with the issue code `field.protected`); TypeScript leaves
them out of create and update input. The email changes only through a
confirmed email change, so it stays in step with credentials and linked
accounts.

Sign-up creates the User through the ordinary pipeline (validation, defaults,
Hooks) with the plugin's own `authority:elevate` privilege: the User's Access
need not open creation and no `masterAuthority` is required. Invalid data
fails with `AUTH_SIGN_UP_REJECTED`, whose `details.fields` names the missing or
invalid fields; a duplicate unique value is rejected without naming it.

## Sessions and the current principal

Session tokens are 32 random bytes with the `ub_s1.` prefix; only their
SHA-256 digest is stored. Sessions roll for seven days within a thirty-day
ceiling. `authPlugin` provides Core's current principal (ADR-0304): Access
rules, Hooks, ACL and Roles receive the User pointer as `principal`; the
request values `authPrincipal`, `authSession` and `authClient` read the
session itself.

```ts
authPlugin({
	methods: [password()],
	session: {
		expiresInMs: 24 * 60 * 60_000,
		absoluteExpiresInMs: 30 * 24 * 60 * 60_000,
		revokeOnPasswordChange: true, // The default.
		recentAuthenticationMs: 5 * 60_000, // The default.
	},
})
```

`listSessions()` reports each live session's id, method, creation, last use
(updated at most once a minute), expiry, address and `User-Agent`, never its
token; `revokeSession(id)` ends one, `logoutEverywhere()` all of them. A
password change revokes the user's other sessions unless
`revokeOnPasswordChange` is `false`. On the server,
`ultimabase.plugin(authPlugin)` returns `runWithSession(token, fn)`,
`listSessions(user)` and `revokeSessions(user)` for administration; they are
never exposed to clients.

`deleteAccount()` and `unlinkMethod(id)` need a recent authentication: a login
younger than `recentAuthenticationMs`, or a method's re-authentication such as
`reauthenticate({ password })`. Otherwise they fail with
`AUTH_REAUTHENTICATION_REQUIRED`. Deleting the account deletes the User with
the plugin's elevation; its sessions, linked accounts and method secrets
follow by cascade.

## Attempt limiting

Failed sign-in attempts are counted in the database, so every server shares
them. Per account and client address, five failures are free, then each
further one locks that pair for one second, doubled per failure up to fifteen
minutes; per account, twenty failures are free with the same growth. A
success resets both counters. A locked attempt fails with
`AUTH_TOO_MANY_ATTEMPTS` (HTTP 429 with `Retry-After`) before any password
work. The HTTP plugin's per-address `rateLimit` adds a global limit.

## Account tokens

Password reset, email verification and email change use single-use tokens:
32 random bytes with a prefix per purpose (`ub_r1.`, `ub_v1.`, `ub_c1.`),
stored only as their SHA-256 digest. A user has at most one live token per
purpose: a new one cancels the previous one. A token is accepted once, before
its expiry, for its own purpose only; any other token fails with
`AUTH_INVALID_TOKEN`. Methods issue and redeem them through the foundation's
services (`issueToken`, `findToken`, `consumeToken`); UltimaBase sends no
email, the application's callbacks deliver them.

## Linked accounts

Each method account of a user is a private row `{ method, providerUserId,
email, emailVerified }`, unique per `(method, providerUserId)`; provider
secrets never enter the User row. `listMethods()` lists a user's methods and
`unlinkMethod(id)` removes one, never the last (`AUTH_LAST_METHOD`). With
`linking: 'verified-email'` (the default) a method may attach a new account to
the user who verified the same email; with `'manual'` only an authenticated
user links. A password email counts as verified after `verifyEmail`, a
password reset or a confirmed email change; the first user to verify an email
keeps it for automatic linking. Methods call the foundation's services for this (see
`defineAuthMethod`).

## HTTP

Installing `@ultimabase/http-plugin` serves every operation under one prefix,
`/api/auth` by default (`http: { basePath }`): `POST /api/auth/sign-up`,
`/api/auth/login`, `/api/auth/current`, `/api/auth/refresh`,
`/api/auth/logout`, `/api/auth/logout-everywhere`, `/api/auth/list-sessions`,
`/api/auth/revoke-session`, `/api/auth/list-methods`,
`/api/auth/unlink-method`, `/api/auth/delete-account`,
`/api/auth/change-password`, `/api/auth/reauthenticate`, and with an email
identifier `/api/auth/request-password-reset`, `/api/auth/reset-password`,
`/api/auth/request-email-verification`, `/api/auth/verify-email`,
`/api/auth/request-email-change` and `/api/auth/confirm-email-change`. Routes
that redeem or request tokens ignore a stale session cookie; a reset clears
it. They sit beside REST,
which mounts only its own roots under `/api` (ADR-0324, 6.4a amendment). The
JSON body is the operation input; the response is `{ "result": … }`. Requests authenticate with `Authorization: Bearer <token>`.

```ts
authPlugin({
	methods: [password()],
	http: { cookie: { name: '__Host-todo-session', sameSite: 'lax' } },
})
```

With a cookie, the same routes answer browsers (requests with `Origin`) with a
`Secure`, `HttpOnly`, host-only `__Host-` cookie instead of the token; clients
without `Origin` keep Bearer. Browser requests to these routes, and every
unsafe request the cookie authenticates, need `application/json` and an
allowed origin: `httpPlugin({ browser: { origins, credentials: true } })`.
Bearer and cookie together are rejected; a stale cookie never blocks sign-up
or login.

## Transports

Every operation is public (ADR-0324): GraphQL exposes them with typed fields
(`signUp`, `login`, `current`, …, the payload's `user` being the User type)
and REST under `/api/operations/<name>`. Hide them per transport, for example
`restPlugin({ hide: [...Object.values(authOperations), ...Object.values(passwordOperations)] })`
when the `/api/auth` routes serve HTTP clients.

## Events

```ts
authPlugin({
	methods: [password()],
	events: {
		afterLogin: (event) => audit(event),
		afterLoginFailed: (event) => alert(event),
	},
})
```

`afterSignUp`, `afterLogin`, `afterLoginFailed`, `afterLogout`,
`afterPasswordReset`, `afterEmailVerified` and `afterEmailChanged` run after
the transaction that caused them commits, outside the request, best effort
(ADR-0318); a failure is logged and never fails the call. Payloads carry ids,
the method, the client address and the attempted identifier, never a password
or token. The client address and `afterLoginFailed`'s normalized identifier
(an email or username, even for an unknown account) are personal data: store,
retain and forward them under the application's privacy policy, like the
emails of `afterEmailVerified` and `afterEmailChanged`. `afterPasswordReset`
follows a reset (every session revoked), `afterEmailVerified` a verification
or a reset that verified the email, `afterEmailChanged` a confirmed change.
UltimaBase sends no email: messages go through application callbacks.

## Writing a method

`defineAuthMethod({ name, contributions, … })` creates a method from
operations and the foundation's services (`createUser`, `signIn`,
`authenticateAccount`, `linkAccount`, attempt limiting, recent
authentication, single-use tokens, `markEmailVerified`, `changeEmail`,
`completePasswordReset`). `userEmail: true` declares that the method adds the
User's `email`, which brings the verification fields and their protection.
Its type arguments name the User fields, the statics slot and the operations
it adds.
