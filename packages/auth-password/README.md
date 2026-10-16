# @ultimabase/auth-password

The password sign-in method of [`@ultimabase/auth-plugin`](../auth-plugin/README.md)
(ADR-0326).

Every code block in this README is copied from the tested
[`examples/auth`](../../examples/auth/README.md) application by
`yarn docs:regions` (ADR-0330): edit the example, then run the script. Its
factory signs members in by email, with the three email flows:

<!-- region ../../examples/auth/src/schema.ts#factory -->

```ts
import { accessPlugin } from '@ultimabase/access-plugin'
import { apiServer } from '@ultimabase/api-server'
import {
	password,
	passwordEmailOperations,
	passwordOperations,
} from '@ultimabase/auth-password'
import { authOperations, authPlugin } from '@ultimabase/auth-plugin'
import { UltimaBase, isAuthenticated } from '@ultimabase/core'
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

`identifier` selects the User field users log in with: `'username'` (the
default) or `'email'`. `username` is added to the User schema as a required,
unique, immutable string; `email` is added by the foundation, with
`emailVerified` and `emailVerifiedAt`, and no create or update input accepts
it (sign-up takes it beside the create fields). Both are unique targets of
`updateOne` and `deleteOne`, and both are stored in their normalized form:

- a username keeps 3 to 64 letters, digits, `.`, `_` or `-`, NFKC-normalized
  and lowercased;
- an email is trimmed, NFKC-normalized, lowercased and checked as an address;
  it changes only through `confirmEmailChange`.

Direct User creation must already use the normalized username; with an email
identifier only sign-up (or the foundation's `auth.createUser`) creates Users.
Sign-up and login normalize their input. Passwords are 15 to 256 Unicode code points,
NFC-normalized, never trimmed.

## Members

Sign-up and login, then a password change and a re-authentication on the
server, where `auth` is `ultimabase.plugin(authPlugin)`:

<!-- region ../../examples/auth/tests/sign-up.test.ts#sign-up,login -->

```ts
const { user, session } = await Member.signUp({
	displayName: 'Ada',
	email: 'ada@example.com',
	password: 'correct horse battery staple',
})

const login = await Member.login({
	email: ' Ada@Example.com ',
	password: 'correct horse battery staple',
})
```

<!-- endregion -->

<!-- region ../../examples/auth/tests/sessions.test.ts#change-password -->

```ts
await auth.runWithSession(session.token, () =>
	Member.changePassword({
		currentPassword: 'correct horse battery staple',
		newPassword: 'another correct horse battery staple',
	}),
)
```

<!-- endregion -->

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

- `signUp` takes the User's create fields and `password`, and returns the
  readable User and a new session.
- `login` takes exactly the identifier and `password`; every failure is the
  same `AUTH_INVALID_CREDENTIALS`, an unknown identifier paying for a full
  verification.
- `changePassword` checks the current password, keeps the current session and,
  with `revokeOnPasswordChange`, revokes the others.
- `reauthenticate` proves the password again, allowing `deleteAccount` and
  `unlinkMethod` through the session, from the next call on, for the
  recent-authentication window.

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

The example passes these option groups to `password()`; `sendEmail` is its
test sender, an outbox standing in for an email provider:

<!-- region ../../examples/auth/src/email-flows.ts#reset,verification,email-change -->

```ts
/** The token travels in the URL fragment, which browsers never send to a server. */
export const reset = {
	sendResetEmail: ({ email, token }) => {
		sendEmail({
			to: email,
			subject: 'Reset your password',
			link: `https://notes.example.com/reset#${token}`,
		})
	},
} satisfies PasswordResetOptions

/** Sent after sign-up and on request, while the email is unverified. */
export const verification = {
	sendVerificationEmail: ({ email, token }) => {
		sendEmail({
			to: email,
			subject: 'Verify your email',
			link: `https://notes.example.com/verify#${token}`,
		})
	},
} satisfies PasswordVerificationOptions

/** The new address proves its mailbox; the previous one is told afterwards. */
export const emailChange = {
	sendConfirmationEmail: ({ email, token }) => {
		sendEmail({
			to: email,
			subject: 'Confirm your new email',
			link: `https://notes.example.com/confirm-email#${token}`,
		})
	},
	sendNoticeEmail: ({ email, newEmail }) => {
		sendEmail({ to: email, subject: `Your email changed to ${newEmail}` })
	},
} satisfies PasswordEmailChangeOptions
```

<!-- endregion -->

A reset, a verification and an email change, each with the token from the
emailed link:

<!-- region ../../examples/auth/tests/email.test.ts#request-reset,reset-password -->

```ts
const answer = await Member.requestPasswordReset({ email: 'ada@example.com' })

// The page the link opens reads the token from the URL fragment.
await Member.resetPassword({
	token,
	newPassword: 'another correct horse battery staple',
})
```

<!-- endregion -->

<!-- region ../../examples/auth/tests/email.test.ts#request-verification,verify-email -->

```ts
await Member.requestEmailVerification({ email: 'ada@example.com' })

await Member.verifyEmail({ token })
```

<!-- endregion -->

<!-- region ../../examples/auth/tests/email.test.ts#request-email-change,confirm-email-change -->

```ts
await auth.runWithSession(session.token, () =>
	Member.requestEmailChange({
		currentPassword: 'correct horse battery staple',
		newEmail: 'ada@lovelace.example',
	}),
)

await Member.confirmEmailChange({ token })
```

<!-- endregion -->

- `requestPasswordReset` and `requestEmailVerification` answer
  `{ accepted: true }` whether the address has an account or not: the same
  attempt limiting, the same reads, and the callback runs after commit,
  outside the request. A reset token expires after one hour by default
  (`expiresInMs`, five minutes to one day); a verification token after one day
  (five minutes to seven days).
- `resetPassword` checks the token, sets the password, revokes every session,
  marks the email verified and resets the login counters. It does not log in.
- Sign-up sends a verification token when `verification` is configured.
  `verifyEmail` marks the email verified. With `requireVerifiedEmail: true`,
  no session exists until the email is verified: `signUp` returns
  `{ user, verificationRequired: true }` (no token, no cookie; typed from the
  option in TypeScript, GraphQL `PasswordSignUpPendingPayload` and the
  OpenAPI result), `login` fails with `AUTH_EMAIL_NOT_VERIFIED` (HTTP 403)
  after a correct password, and `refresh` refuses the user's existing
  sessions.
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
and are counted per client address, when one is known. Callbacks receive the
User row and the email: both are personal data. Never log the token; put it in
a link to your application, which calls the redeeming operation.

Over HTTP the operations are `POST /api/auth/request-password-reset`,
`/api/auth/reset-password`, `/api/auth/request-email-verification`,
`/api/auth/verify-email`, `/api/auth/request-email-change` and
`/api/auth/confirm-email-change`; in GraphQL, mutations of the same names.
`passwordEmailOperations` names them for `hide`.

## Password policy

Verifiers use Argon2id v19 (65,536 KiB, three passes, four lanes, 32-byte tag)
in private storage, never in the User row. The example's second application raises them, and also requires a verified
email before any session (`requireVerifiedEmail`):

<!-- region ../../examples/auth/src/strict.ts#strict-password -->

```ts
/**
 * Stronger Argon2id parameters, and no session before the email is
 * verified. Raise `policyVersion` with any hash parameter: a successful
 * login upgrades an older verifier.
 */
export const strictPassword = password({
	identifier: 'email',
	policy: {
		policyVersion: 2,
		memoryCostKiB: 131_072,
		timeCost: 3,
		parallelism: 4,
	},
	verification: {
		sendVerificationEmail: ({ email, token }) => {
			sendEmail({
				to: email,
				subject: 'Verify your email',
				link: `https://reader.example.com/verify#${token}`,
			})
		},
		requireVerifiedEmail: true,
	},
})
```

<!-- endregion -->

Changing a hash parameter requires a higher `policyVersion`; a successful
login upgrades an older verifier. The method claims
`environment:native-code` for the `argon2` binding. Temporary password bytes
are overwritten after hashing; JavaScript strings cannot be erased.
