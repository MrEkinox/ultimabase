# @ultimabase/auth-plugin

The authentication foundation of UltimaBase (ADR-0326): the User schema,
sessions shared by every sign-in method, the current principal, linked
accounts, attempt limiting, account events and the authentication routes
under one HTTP prefix. Sign-in methods are separate packages, such as
[`@ultimabase/auth-password`](../auth-password/README.md); they depend on the
foundation and never on each other.

Every code block in this README is copied from the tested
[`examples/auth`](../../examples/auth/README.md) application by
`yarn docs:regions` (ADR-0330): edit the example, then run the script. Its
schema file installs the foundation with the password method, declares the
User and opens each member's own profile through Access:

<!-- region ../../examples/auth/src/app.ts#factory -->

```ts
import { accessPlugin } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import {
	password,
	passwordEmailOperations,
	passwordOperations,
} from '@ultimabase/auth-password'
import { authOperations, authPlugin } from '@ultimabase/auth-plugin'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

import { emailChange, reset, verification } from './email-flows.ts'
import { authEvents } from './events.ts'

const day = 24 * 60 * 60_000

/**
 * `authPlugin` adds `App.UserSchema`, sessions and the `/api/auth` routes;
 * `password()` signs members in by email. Authentication grants no
 * permission: the Access rules below decide what a signed-in member may do.
 * `postgresPlugin()` reads `DATABASE_URL` when the application starts.
 */
export const App = UltimaBase.use(
	accessPlugin(),
	authPlugin({
		methods: [
			password({ identifier: 'email', reset, verification, emailChange }),
		],
		session: {
			expiresInMs: day, // Ends a day after login or the last refresh.
			absoluteExpiresInMs: 30 * day, // The default ceiling.
			revokeOnPasswordChange: true, // The default.
			recentAuthenticationMs: 5 * 60_000, // The default.
		},
		// Browsers keep the session in this cookie instead of reading a token.
		http: { cookie: { name: '__Host-notes-session', sameSite: 'lax' } },
		events: authEvents,
	}),
	...apiServer({
		http: {
			// One reverse proxy in front: `X-Forwarded-For` names the client.
			trustProxy: 1,
			browser: { origins: ['https://notes.example.com'], credentials: true },
		},
		// Clients use the `/api/auth` routes; REST serves only the schemas.
		rest: {
			hide: [
				...Object.values(authOperations),
				...Object.values(passwordOperations),
				...Object.values(passwordEmailOperations),
			],
		},
	}),
	postgresPlugin(),
)
```

<!-- endregion -->

<!-- region ../../examples/auth/src/schema.ts#imports,member -->

```ts
import { isAuthenticated } from '@ultimabase/core'

import { App } from './app.ts'

/**
 * The User: `password({ identifier: 'email' })` adds `email`,
 * `emailVerified` and `emailVerifiedAt`, which no create or update input
 * accepts. Sign-up creates members without any `create` rule.
 */
export const Member = App.UserSchema.define({
	className: 'Member',
	fields: (field) => ({
		displayName: field.string({ required: true }),
		bio: field.string(),
	}),
}).with({
	access: {
		// Members read and edit only their own profile.
		read: ({ principal, where }) =>
			principal === undefined ? false : where.eq('id', principal.id),
		update: ({ principal, where }) =>
			principal === undefined ? false : where.eq('id', principal.id),
	},
})
```

<!-- endregion -->

A member signs up without any Master key; `user` is `Model<'Member'>` and
`session.token` is returned exactly once:

<!-- region ../../examples/auth/tests/sign-up.test.ts#sign-up -->

```ts
const { user, session } = await Member.signUp({
	displayName: 'Ada',
	email: 'ada@example.com',
	password: 'correct horse battery staple',
})
```

<!-- endregion -->

## The User schema

`App.UserSchema.define({ className, fields })` declares the application's
User like any form D schema: `define` also accepts `indexes` and feature keys,
it ends with `.with({ access: …, hooks: … })`, and its
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

When a method signs in by email (`password({ identifier: 'email' })`), the
foundation adds `email`, `emailVerified` (`false` by default) and
`emailVerifiedAt` to the User with forbidden mutation input, like Soft
Delete's fields: no create or update input accepts them, in TypeScript, REST,
OpenAPI or GraphQL, Master included. Only the authentication flows write them,
through a Master-only schema mutation owned by the foundation that refuses
callers outside the flows, so the email stays in step with credentials and
linked accounts. Users of such an application are created only by sign-up, or
on the server by `auth.createUser({ data, email })` for administration and
seeding; any other create fails with `VALIDATION_ERROR` (issue code
`auth.user-creation`).

Sign-up creates the User through the ordinary pipeline (validation, defaults,
Hooks) with the plugin's own `authority:elevate` privilege: the User's Access
need not open creation and no `masterAuthority` is required. Invalid data
fails with `AUTH_SIGN_UP_REJECTED`, whose `details.fields` names the missing or
invalid fields; a duplicate unique value is rejected without naming it.

## Sessions and the current principal

Session tokens are 32 random bytes with the `ub_s1.` prefix; only their
SHA-256 digest is stored. A session expires `expiresInMs` (seven days by
default) after it is issued or last refreshed: using it does not extend it,
`refresh(token)` rotates its token and does. No refresh extends it beyond
`absoluteExpiresInMs` (thirty days by default) after its login. The factory
above sets one day. `authPlugin` provides Core's current principal (ADR-0304): Access
rules, Hooks, ACL and Roles receive the User pointer as `principal`; the
request values `authPrincipal`, `authSession` and `authClient` read the
session itself.

On the server, `runWithSession(token, fn)` runs `fn` as the session's user,
and the Access rules of the example's `Note` receive that member:

<!-- region ../../examples/auth/tests/sessions.test.ts#current,principal -->

```ts
const auth = ultimabase.plugin(authPlugin)
const me = await auth.runWithSession(session.token, () => Member.current())

const notes = await auth.runWithSession(session.token, async () => {
	await Note.createOne({ data: { author: user.id, body: 'Call Grace' } })
	return Note.findMany()
})
```

<!-- endregion -->

`listSessions()` reports each live session's id, method, creation, last use
(updated at most once a minute), expiry, address (`null` when unknown) and
`User-Agent`, never its token; `revokeSession(id)` ends one,
`logoutEverywhere()` all of them:

<!-- region ../../examples/auth/tests/sessions.test.ts#list-sessions,revoke-session,refresh-logout -->

```ts
const { sessions } = await auth.runWithSession(laptop.token, () =>
	Member.listSessions(),
)

await auth.runWithSession(laptop.token, () => Member.revokeSession(phone.id))

const rotated = await Member.refresh(laptop.token)
await Member.logout(rotated.session.token)
```

<!-- endregion -->

A password change revokes the user's other sessions unless
`revokeOnPasswordChange` is `false`. On the server,
`ultimabase.plugin(authPlugin)` returns `runWithSession(token, fn)`,
`listSessions(user)`, `revokeSessions(user)` and `createUser({ data, email })`
for administration; they are never exposed to clients. With
`requireVerifiedEmail`, `refresh` refuses users whose email is not verified
(`AUTH_EMAIL_NOT_VERIFIED`).

`deleteAccount()` and `unlinkMethod(id)` need a recent authentication: a login
younger than `recentAuthenticationMs`, or a method's re-authentication such as
`reauthenticate({ password })`, which applies at once: to the calls that
follow in the same request or `runWithSession` scope, and to the session's next
requests. Otherwise they fail with `AUTH_REAUTHENTICATION_REQUIRED`:

<!-- region ../../examples/auth/tests/account.test.ts#delete-account -->

```ts
// Proves the password again: the calls that follow through this session
// may run sensitive operations for five minutes.
await auth.runWithSession(session.token, () =>
	Member.reauthenticate({ password: 'correct horse battery staple' }),
)
const deleted = await auth.runWithSession(session.token, () =>
	Member.deleteAccount(),
)
```

<!-- endregion -->

Deleting the account deletes the User with
the plugin's elevation; its sessions, linked accounts and method secrets
follow by cascade.

## Attempt limiting

Failed sign-in attempts are counted in the database, so every server shares
them. Per account and client address, five failures are free, then each
further one locks that pair for one second, doubled per failure up to fifteen
minutes; per account, twenty failures are free with the same growth. A
success resets both counters. A locked attempt fails with
`AUTH_TOO_MANY_ATTEMPTS` (HTTP 429 with `Retry-After`) before any password
work. Outside HTTP, or when the HTTP plugin knows no client address, only the
account limit applies. The HTTP plugin's per-address `rateLimit` adds a global
limit.

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
The example's tests send them in memory with `t.fetch`, as a client would:

<!-- region ../../examples/auth/tests/http.test.ts#http-login,http-bearer -->

```ts
const login = await t.fetch('/api/auth/login', {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({
		email: 'ada@example.com',
		password: 'correct horse battery staple',
	}),
})

const notes = await t.fetch('/api/classes/Note', {
	headers: { authorization: `Bearer ${token}` },
})
```

<!-- endregion -->

The example's factory sets `http: { cookie: { name: '__Host-notes-session', sameSite: 'lax' } }`.

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
and REST under `/api/operations/<name>`. Hide them per transport when the
`/api/auth` routes serve HTTP clients: the example's factory passes
`authOperations`, `passwordOperations` and `passwordEmailOperations` to
`rest: { hide }`, and `/api/operations/login` then answers 404.

## Events

The example's factory passes these handlers as `events`:

<!-- region ../../examples/auth/src/events.ts#events -->

```ts
/** Run after the transaction commits, best effort: a failure never fails the call. */
export const authEvents: AuthEventHandlers = {
	afterSignUp: ({ userId, address }) => {
		securityLog.push({ event: 'sign-up', userId, address })
	},
	afterLogin: ({ userId, address }) => {
		securityLog.push({ event: 'login', userId, address })
	},
	// `identifier` is the normalized email tried, even for an unknown account.
	afterLoginFailed: ({ identifier, address, limited }) => {
		securityLog.push({
			event: limited ? 'login-locked' : 'login-failed',
			identifier,
			address,
		})
	},
	afterPasswordReset: ({ userId }) => {
		securityLog.push({ event: 'password-reset', userId, address: null })
	},
}
```

<!-- endregion -->

`afterSignUp`, `afterLogin`, `afterLoginFailed`, `afterLogout`,
`afterPasswordReset`, `afterEmailVerified` and `afterEmailChanged` run after
the transaction that caused them commits, outside the request, best effort
(ADR-0318); a failure is logged and never fails the call. Payloads carry ids,
the method, the client address (`null` outside HTTP or when unknown) and the
attempted identifier, never a password or token. The client address and
`afterLoginFailed`'s normalized identifier (an email or username, even for an
unknown account) are personal data: store, retain and forward them under the
application's privacy policy, like the emails of `afterEmailVerified` and
`afterEmailChanged`. `afterPasswordReset` follows a reset (every session
revoked), `afterEmailVerified` a verification or a reset that verified the
email, `afterEmailChanged` a confirmed change.
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
