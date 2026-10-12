# @ultimabase/auth-password

The password sign-in method of [`@ultimabase/auth-plugin`](../auth-plugin/README.md)
(ADR-0326).

```ts
import { password } from '@ultimabase/auth-password'
import { authPlugin } from '@ultimabase/auth-plugin'

authPlugin({ methods: [password({ identifier: 'email' })] })
```

`identifier` selects the User field users log in with: `'username'` (the
default) or `'email'`. The method adds it to the User schema as a required,
unique, immutable string, stored in its normalized form:

- a username keeps 3 to 64 letters, digits, `.`, `_` or `-`, NFKC-normalized
  and lowercased;
- an email is trimmed, NFKC-normalized, lowercased and checked as an address.

Direct User creation must already use the normalized form; sign-up and login
normalize their input. Passwords are 15 to 256 Unicode code points,
NFC-normalized, never trimmed.

## Members

```ts
const { user, session } = await TodoUser.signUp({
	email: 'ada@example.com',
	password: 'correct horse battery staple',
	displayName: 'Ada',
})
await TodoUser.login({ email: 'ada@example.com', password })
await auth.runWithSession(session.token, () =>
	TodoUser.changePassword({ currentPassword, newPassword }),
)
await auth.runWithSession(session.token, () =>
	TodoUser.reauthenticate({ password }),
)
```

- `signUp` takes the User's create fields and `password`, and returns the
  readable User and a new session.
- `login` takes exactly the identifier and `password`; every failure is the
  same `AUTH_INVALID_CREDENTIALS`, an unknown identifier paying for a full
  verification.
- `changePassword` checks the current password, keeps the current session and,
  with `revokeOnPasswordChange`, revokes the others.
- `reauthenticate` proves the password again, allowing `deleteAccount` and
  `unlinkMethod` for the recent-authentication window.

Login, password change and re-authentication follow the foundation's attempt
limiting. Over HTTP they are `POST /auth/sign-up`, `/auth/login`,
`/auth/change-password` and `/auth/reauthenticate`; in GraphQL, `signUp`,
`login`, `changePassword` and `reauthenticate`. `passwordOperations` names
them for `hide`.

## Password policy

Verifiers use Argon2id v19 (65,536 KiB, three passes, four lanes, 32-byte tag)
in private storage, never in the User row:

```ts
password({
	policy: {
		policyVersion: 2,
		memoryCostKiB: 131_072,
		timeCost: 3,
		parallelism: 4,
	},
})
```

Changing a hash parameter requires a higher `policyVersion`; a successful
login upgrades an older verifier. The method claims
`environment:native-code` for the `argon2` binding. Temporary password bytes
are overwritten after hashing; JavaScript strings cannot be erased.
