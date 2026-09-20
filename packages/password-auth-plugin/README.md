# @ultimabase/password-auth-plugin

Optional local username and password identity for UltimaBase applications.

The plugin owns the public `User` identity schema, canonical usernames,
Argon2id password verifiers, opaque revocable sessions, and four
transport-neutral operations. Password and session verifiers remain in
owner-private storage rather than application schemas.

```ts
import { MasterAuthority, UltimaBase } from '@ultimabase/core'
import {
	PasswordUserSchema,
	passwordAuthPlugin,
} from '@ultimabase/password-auth-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

const AppUser = PasswordUserSchema.define({
	className: 'User',
	fields: (field) => ({
		displayName: field.string(),
	}),
})

const ultimabase = new UltimaBase({
	masterAuthority: new MasterAuthority({
		keys: [{ id: 'server', value: env.ULTIMABASE_MASTER_KEY }],
		onUse: (event) => auditMasterUse(event),
	}),
	plugins: [
		passwordAuthPlugin({ user: AppUser }),
		postgresPlugin({ url: env.DATABASE_URL }),
	],
	schemas: [],
})

await ultimabase.start()

const signedUp = await AppUser.signUp(
	{
		username: 'Ada',
		password: 'correct horse battery staple',
	},
	{ ultimabase },
)

const loggedIn = await AppUser.login(
	{ username: 'Ada', password: 'correct horse battery staple' },
	{ ultimabase },
)
const refreshed = await AppUser.refresh(loggedIn.session.token, { ultimabase })
await AppUser.logout(refreshed.session.token, { ultimabase })

const auth = ultimabase.application.getPlugin(
	'@ultimabase/password-auth-plugin',
)
await auth.runWithSession(
	signedUp.session.token,
	() => AppUser.findMany(), // Queries inherit the authenticated request context.
)
```

`AppUser.signUp()`, `login()`, `refresh()`, and `logout()` execute the existing
application operations. The default `PasswordUser` exposes the same methods.
Pass `{ ultimabase }` in scripts; inside an active request, omit it to inherit
the application's facade. A conflicting explicit application or a User class
not installed in that application is rejected before credential work. The
application must be started. These methods do not store a current user or token
on the class and do not appear on User model instances.

Refresh and logout validate their explicit token and establish its session
scope internally. Use `runWithSession()` for other authenticated application
work. The class methods accept no caller Master or context override.

`username` is injected as a required, unique, immutable field. Custom User
schemas cannot redeclare it or add `password`, `passwordHash`, `credential`, or
`session`. Passwords are operation inputs only and never become schema fields,
schema Typegen fields, request values, events, diagnostics, or serialized data.
Direct trusted User creation accepts only the canonical stored representation.
`signUp` and `login` normalize public credentials. `logout` revokes only the
current session, while `refresh` atomically rotates its token. Sign-up requires
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
`passwordPrincipal` and `passwordSession` values; neither contains the raw
token, password, verifier, grant, role, or authorization decision. Access and
ACL plugins remain solely responsible for authorization.

The four operations remain private until explicitly included in a transport.
For REST v1, pass the exact operation tokens to `restPlugin({ operations })`.
Password Auth contributes the compatible codecs and maps its three public
errors to status 400 or 401 without importing REST.

The same explicit tokens may be passed to `graphqlPlugin({ operations })`.
Password Auth contributes canonical GraphQL metadata and codecs for `signUp`,
`login`, `refresh`, and `logout` without importing the GraphQL package. The
GraphQL payload exposes `principal.userId`, `session`, and a required `user`
field using the configured User output type. REST exposes the same readable
profile in `result.user`, beside its existing principal pointer and session.
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
`/auth/v1/logout`, and `/auth/v1/refresh`. These routes execute the same four
transport-neutral operations. Successful sign-up, login, and refresh responses
set a `Secure`, `HttpOnly`, `Path=/`, host-only cookie whose expiration matches
the rolling session; their JSON omits the raw token. Logout revokes the current
session and expires the cookie.

The application's HTTP browser policy must enable credentials for explicit
origins and allow `POST`, `Content-Type`, and
`X-UltimaBase-Application-Id`. Every cookie route requires exact
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
