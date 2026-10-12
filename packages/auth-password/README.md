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
- an email is trimmed, NFKC-normalized, lowercased and checked as an address;
  it changes only through `confirmEmailChange`.

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
limiting. Over HTTP they are `POST /api/auth/sign-up`, `/api/auth/login`,
`/api/auth/change-password` and `/api/auth/reauthenticate`; in GraphQL,
`signUp`, `login`, `changePassword` and `reauthenticate`. `passwordOperations`
names them for `hide`.

## Password reset, email verification and email change

With `identifier: 'email'` the method adds `emailVerified` and
`emailVerifiedAt` (from the foundation) and six operations. Each flow is
enabled by its option group, whose callbacks deliver the messages: UltimaBase
sends no email. Without its group a request answers `AUTH_NOT_CONFIGURED`
(HTTP 501).

```ts
password({
	identifier: 'email',
	reset: { sendResetEmail: ({ email, token }) => mailer.reset(email, token) },
	verification: {
		sendVerificationEmail: ({ email, token }) => mailer.verify(email, token),
		requireVerifiedEmail: true,
	},
	emailChange: {
		sendConfirmationEmail: ({ email, token }) => mailer.confirm(email, token),
		sendNoticeEmail: ({ email, newEmail }) => mailer.notice(email, newEmail),
	},
})

await TodoUser.requestPasswordReset({ email })
await TodoUser.resetPassword({ token, newPassword })
await TodoUser.requestEmailVerification({ email })
await TodoUser.verifyEmail({ token })
await auth.runWithSession(session.token, () =>
	TodoUser.requestEmailChange({ currentPassword, newEmail }),
)
await TodoUser.confirmEmailChange({ token })
```

- `requestPasswordReset` and `requestEmailVerification` answer
  `{ accepted: true }` whether the address has an account or not: the same
  attempt limiting, the same reads, and the callback runs after commit,
  outside the request. A reset token expires after one hour by default
  (`expiresInMs`, five minutes to one day); a verification token after one day
  (five minutes to seven days).
- `resetPassword` checks the token, sets the password, revokes every session,
  marks the email verified and resets the login counters. It does not log in.
- Sign-up sends a verification token when `verification` is configured.
  `verifyEmail` marks the email verified. With `requireVerifiedEmail`, `login`
  fails with `AUTH_EMAIL_NOT_VERIFIED` (HTTP 403) after a correct password
  until the email is verified; sign-up still returns its first session.
- `requestEmailChange` checks the current password (attempt limited) and sends
  a confirmation token to the new address; `confirmEmailChange` checks that no
  other account uses the address, replaces and verifies the email, moves the
  login and notifies the previous address. The token expires after one hour by
  default (five minutes to one day). A wrong password, an invalid or
  unchanged address and an address taken at confirmation fail with the same
  `AUTH_EMAIL_CHANGE_REJECTED`. A password reset or change cancels a pending
  email change, so a stolen password cannot keep a way back into a recovered
  account.

Tokens are single use, replaced by a newer one of the same purpose and stored
only as their SHA-256 digest; invalid tokens fail with `AUTH_INVALID_TOKEN`
and are counted per client address. Callbacks receive the User row and the
email: both are personal data. Never log the token; put it in a link to your
application, which calls the redeeming operation.

Over HTTP the operations are `POST /api/auth/request-password-reset`,
`/api/auth/reset-password`, `/api/auth/request-email-verification`,
`/api/auth/verify-email`, `/api/auth/request-email-change` and
`/api/auth/confirm-email-change`; in GraphQL, mutations of the same names.
`passwordEmailOperations` names them for `hide`.

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
