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
	passwordAuthOperations,
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

const signedUp = await ultimabase
	.operation(passwordAuthOperations.signUp)
	.execute({
		username: 'Ada',
		password: 'correct horse battery staple',
	})

const auth = ultimabase.application.getPlugin(
	'@ultimabase/password-auth-plugin',
)
await auth.runWithSession(
	signedUp.session.token,
	() => AppUser.findMany(), // Queries inherit the authenticated request context.
)
```

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
