# @ultimabase/password-auth-plugin

Optional local username and password identity for UltimaBase applications.

Issue 2312 provides the plugin-owned `User` schema, canonical username and
password contracts, Argon2id verifier handling, and owner-private credential
storage. Session operations and HTTP credential resolution are delivered by the
following milestone issues.

```ts
import { UltimaBase } from '@ultimabase/core'
import {
	PasswordUserSchema,
	passwordAuthPlugin,
} from '@ultimabase/password-auth-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'

const AppUser = PasswordUserSchema.define({
	className: 'User',
	fields: (field) => ({
		displayName: field.string({ required: true }),
	}),
})

const ultimabase = new UltimaBase({
	plugins: [
		passwordAuthPlugin({ user: AppUser }),
		postgresPlugin({ url: env.DATABASE_URL }),
	],
	schemas: [],
})

await ultimabase.start()
```

`username` is injected as a required, unique, immutable field. Custom User
schemas cannot redeclare it or add `password`, `passwordHash`, `credential`, or
`session`. Passwords are operation inputs only and never become schema fields,
Typegen declarations, request values, events, diagnostics, or serialized data.
Direct trusted User creation accepts only the canonical stored representation;
the sign-up and login operations added by issue 2313 own normalization of public
credentials.

The plugin requests the critical `storage:private` privilege and the
`environment:native-code` claim. Its private credential collection is compiled
by the selected database adapter but remains unreachable through application
Query, model, REST, GraphQL, Hooks, Access, or raw adapter surfaces.

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
