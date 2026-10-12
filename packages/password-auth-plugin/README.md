# @ultimabase/password-auth-plugin

Optional local username and password identity for UltimaBase applications.

The plugin owns the public `User` identity schema, canonical usernames,
Argon2id password verifiers, opaque revocable sessions, and six
transport-neutral operations. Password and session verifiers remain in
owner-private storage rather than application schemas.

```ts
import { MasterAuthority, UltimaBase } from '@ultimabase/core'
import {
	PasswordUserSchema,
	passwordAuthPlugin,
} from '@ultimabase/password-auth-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

const Base = UltimaBase.use(postgresPlugin({ url: env.DATABASE_URL }))

const AppUser = PasswordUserSchema.define(Base.Schema, {
	className: 'User',
	fields: (field) => ({
		displayName: field.string({ required: true }),
	}),
})

const authPlugin = passwordAuthPlugin({ user: AppUser })

const Application = Base.use(authPlugin)
const ultimabase = new Application({
	masterAuthority: new MasterAuthority({
		keys: [{ id: 'server', value: env.ULTIMABASE_MASTER_KEY }],
		onUse: (event) => auditMasterUse(event),
	}),
	schemas: [AppUser],
})

await ultimabase.start()

const signedUp = await AppUser.signUp({
	displayName: 'Ada Lovelace',
	username: 'Ada',
	password: 'correct horse battery staple',
})

const loggedIn = await AppUser.login({
	username: 'Ada',
	password: 'correct horse battery staple',
})
const refreshed = await AppUser.refresh(loggedIn.session.token)
await AppUser.logout(refreshed.session.token)

const auth = ultimabase.plugin(authPlugin)
await auth.runWithSession(
	signedUp.session.token,
	() => AppUser.current(), // Queries inherit the authenticated request context.
)
```

Account-scoped helpers use that same authenticated request:

```ts
await auth.runWithSession(loggedIn.session.token, async () => {
	const currentUser = await AppUser.current()
	await AppUser.changePassword({
		currentPassword: 'correct horse battery staple',
		newPassword: 'another correct horse battery staple',
	})
	console.info(currentUser.id)
})

await auth.runWithSession(loggedIn.session.token, () =>
	AppUser.logoutEverywhere(),
)
```

Password change keeps the session that performs the operation usable and
invalidates every other session. Logout everywhere invalidates every session,
including the one that performs it. Neither method accepts a User ID; an
administrative session-revocation API is intentionally not exposed.

`AppUser.signUp()`, `login()`, `refresh()`, `logout()`, `changePassword()`, and
`logoutEverywhere()` execute the corresponding application operations.
`AppUser.current()` reads the authenticated profile through ordinary Query.
The default `PasswordUser` exposes the same methods.
`PasswordUserSchema.define(Base.Schema, options)` receives the configured
factory's field builders and local plugin options directly from source, like
`RoleSchema.define(Base.Schema, options)`. Declare the base before User, then
install Password Auth with that User; separate schema files can import the base
without importing the final application. Exact User query and authentication
results still use the generated User contract. The standalone
`PasswordUserSchema.define(options)` form remains supported and retains its
generated plugin-builder and option contracts.
The generation-free declaration form of
[ADR-0297](../../docs/adr/0297-declare-schemas-without-typegen.md) will provide
an `App.PasswordUserSchema.define` factory once Password Auth migrates; until
then use the forms above. The configured form accepts the `Schema` namespace of
any configured factory, including one whose plugins add shape methods.
Outside a request, these methods resolve the sole started application. Inside a
request, they retain that request's exact application, subject, transaction,
cancellation, and authority. A foreign User class is rejected before credential
work. These methods do not store an application, current user, or token on the
class and do not appear on User model instances.

The plugin adds its built-in default User automatically. A custom User remains
explicit in the application's root `schemas` list; Password Auth claims that
exact class so credentials and transport exposure keep plugin-owned semantics.

`signUp` accepts `username`, `password`, and the User's ordinary create fields in
one flat object. Required fields without defaults must be supplied; optional,
defaulted, and generated fields may be omitted. The class method infers these
rules directly from the declaration, without Typegen. User validation, defaults,
hooks, and the authentication transaction still run through ordinary creation.
`login` accepts exactly `username` and `password`, rejecting profile fields.
`PasswordUserReference` identifies a configured User without widening its typed
`signUp` method.

Refresh and logout validate their explicit token and establish its session
scope internally. `current`, `changePassword`, and `logoutEverywhere` use the
active authenticated request and accept no target User. In scripts, call them
inside `runWithSession()`. The class methods accept no caller Master or context
override.

`username` is injected as a required, unique, immutable field. Custom User
schemas cannot redeclare it or add `password`, `passwordHash`, `credential`, or
`session`. Passwords are operation inputs only and never become schema fields,
schema Typegen fields, request values, events, diagnostics, or serialized data.
Direct trusted User creation accepts only the canonical stored representation.
`signUp` and `login` normalize public credentials. `logout` revokes only the
current session, while `refresh` atomically rotates its token.
`changePassword` verifies the current password, replaces it, preserves the
current session, and revokes every other session. `logoutEverywhere` revokes
every session owned by the authenticated User, including the current one.
Sign-up requires
configured Master authority and audits one temporary elevation before creating
the User; authentication never changes Core authority from `anonymous`.

The plugin requests the critical `storage:private` and `authority:elevate`
privileges plus the `environment:native-code` claim. Private credential and
session collections are compiled by the selected database adapter but remain
unreachable through application Query, models, Typegen, REST schemas, GraphQL,
Hooks, Access, or raw adapter surfaces.

The default password policy uses Argon2id v19 with 65,536 KiB memory, three
passes, four lanes, a fresh library-generated salt, and a 32-byte tag. Optional
configuration is bounded by the accepted security floor:

```ts
passwordAuthPlugin({
	password: {
		policyVersion: 2,
		memoryCostKiB: 131_072,
		timeCost: 3,
		parallelism: 4,
	},
})
```

Changing any hash parameter requires increasing `policyVersion`. Existing
newer policy versions are never downgraded. JavaScript strings are immutable
and cannot be reliably erased; temporary byte buffers created by this package
are overwritten in `finally` blocks.

Session tokens contain 32 cryptographically random bytes and use the
`ub_s1.` prefix. Only their SHA-256 digests are stored. The default rolling
lifetime is seven days with a thirty-day absolute ceiling:

```ts
passwordAuthPlugin({
	session: {
		expiresInMs: 24 * 60 * 60_000,
		absoluteExpiresInMs: 30 * 24 * 60 * 60_000,
	},
})
```

`runWithSession(token, handler)` validates the raw token before opening an
application-owned async request scope. The context contains only the nominal
`passwordPrincipal` and `passwordSession` values, which read the session
itself; neither contains the raw token, password, verifier, grant, role, or
authorization decision. The plugin provides the Core current principal (the
session's User pointer): Access rules, Hooks, ACL callbacks and Roles receive
it as `principal` and never import this plugin (ADR-0304). Access and ACL
plugins remain solely responsible for authorization.

The six operations are declared public (ADR-0324): every installed transport
that supports public operations exposes them, and an application hides one per
transport.
For advanced server code, `application.operation('ultimabase.password-auth.login')`
receives its exact input and result types from the installed plugin source,
without waiting for Typegen. The User-class methods above remain the ordinary
path. The returned User model's exact custom fields still require the generated
application schema graph; Typegen also resolves relationships between schemas.
REST exposes all six; Password Auth contributes the compatible codecs and maps
its four public errors to status 400 or 401 without importing REST. GraphQL
still takes the exact tokens in `graphqlPlugin({ operations })` until it adopts
public operations (ADR-0325).

```ts
import {
	passwordAuthOperationList,
	passwordAuthOperations,
} from '@ultimabase/password-auth-plugin'

restPlugin() // Exposes all six.
restPlugin({ hide: [passwordAuthOperations.refresh] }) // Or hides one.
graphqlPlugin({ operations: passwordAuthOperationList })
```

The public routes are `POST /api/auth/sign-up`, `/api/auth/login`,
`/api/auth/refresh`, `/api/auth/logout`, `/api/auth/change-password`, and
`/api/auth/logout-everywhere`. A custom REST `basePath`
replaces the `/api` prefix. These paths replace the former namespaced
`/operations/ultimabase.password-auth.*` URLs without aliases. Bodies still
use `{ "input": { username, password, ...userFields } }` for signup,
`{ "input": { username, password } }` for login,
`{ "input": { currentPassword, newPassword } }` for password change, or
`{ "input": null }` for refresh, logout, and logout everywhere.

The same explicit tokens may be passed to `graphqlPlugin({ operations })`.
`PasswordAuthSignUpInput` derives the User create fields and adds `password: String!`.
`PasswordAuthCredentialsInput` remains the login-only username/password input.

Password Auth contributes canonical GraphQL metadata and codecs for `signUp`,
`login`, `refresh`, `logout`, `changePassword`, and `logoutEverywhere` without
importing the GraphQL package. The
GraphQL payload exposes only `session` and a required `user` field using the
configured User output type. Select `user { id }` for the authenticated identity.
REST exposes the same readable profile in `result.user`, beside `result.session`.
REST omits the redundant
`principal` field; clients read the authenticated identity from `result.user.id`.
Direct operations return `PasswordAuthenticationResult<TUser>` with
`user: SchemaResult<TUser>` (custom fields follow the generated User contract).

All three successful operations, including refresh, read the current profile
inside their transaction under the newly issued principal and session. This
read starts with anonymous Core authority, even for a Master caller, and retains
ordinary policy, field restrictions, and read Hooks. A missing, filtered-out,
or policy-denied User rejects authentication. Every profile read failure aborts the transaction,
including User/credential creation, session issuance, and token rotation. No
password or stored verifier enters the result. GraphQL selects fields from this ordinary default read; it does not
add relationship inclusion. Returning User does not expose generated User CRUD.

```graphql
mutation {
	refresh {
		user {
			id
			username
			displayName
		}
		session {
			token
			expiresAt
		}
	}
}
```

`displayName` above requires the custom User declared earlier. Restricted fields
follow ordinary transport output rules: REST omits them, while GraphQL applies
its declared field nullability. Authentication grants no schema access by itself.

## Resolve sessions over HTTP

Installing Password Auth contributes the default HTTP credential resolver.
Send exactly one opaque session through `Authorization: Bearer <token>`.
Missing credentials preserve the anonymous context; malformed, expired,
revoked, unknown, or foreign tokens fail before route dispatch. A validated
session adds `passwordPrincipal` and `passwordSession` while Core authority
remains `anonymous`. A separately valid HTTP Master key may coexist and elevate
authority without removing the authenticated identity. Credential headers are
never passed to route handlers.

Secure browser cookies are an explicit opt-in:

```ts
passwordAuthPlugin({
	http: {
		cookie: {
			name: '__Host-notes-session',
			sameSite: 'lax',
		},
	},
})
```

Cookie mode exposes `POST /auth/v1/sign-up`, `/auth/v1/login`,
`/auth/v1/logout`, `/auth/v1/logout-everywhere`, `/auth/v1/change-password`,
and `/auth/v1/refresh`. These routes execute the same six transport-neutral
operations. Successful sign-up, login, and refresh responses
set a `Secure`, `HttpOnly`, `Path=/`, host-only cookie whose expiration matches
the rolling session; their JSON omits the raw token. Password change preserves
the current cookie. Logout and logout everywhere expire it. Sign-up, login and
password change read at most 1 MiB of JSON body: a larger or malformed body
fails without being buffered whole, with the route's public rejection or the
HTTP plugin's `HTTP_PAYLOAD_TOO_LARGE` beyond its own body limit.

The application's HTTP browser policy must enable credentials for explicit
origins: `httpPlugin({ browser: { origins: [...], credentials: true } })`.
The cookie routes make `POST` an allowed method and `Content-Type` and
`X-UltimaBase-Application-Id` are always allowed headers (ADR-0323). Every cookie route requires exact
`application/json` and a non-null matching `Origin`; unsafe application routes
authenticated by the cookie apply the same proof. Cookie mode rejects startup
when the effective policy is incompatible. A request containing both Bearer
and the configured cookie is always rejected as ambiguous.

The configured cookie is ignored only by sign-up and login so a stale
`HttpOnly` cookie cannot permanently prevent credential recovery. Bearer stays
strict on those routes, while logout, refresh, and all application routes still
reject every present invalid cookie.

Configuring cookie mode also declares `@ultimabase/http-plugin` as a required
compatible peer. Bearer-only Password Auth remains usable without an HTTP
consumer for direct server operations.
