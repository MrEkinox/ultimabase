# ADR-0235: Password Auth v1 owns one local User and opaque sessions

- Status: accepted
- Date: 2026-09-06
- Refines: ADR-0113, ADR-0193, ADR-0206, ADR-0224, ADR-0226, ADR-0228, ADR-0233
- Depends on: ADR-0190, ADR-0191, ADR-0205, ADR-0206, ADR-0218, ADR-0224, ADR-0226, ADR-0228, ADR-0233, ADR-0234

## Context

ADR-0224 accepts `@ultimabase/password-auth-plugin` as the first concrete local
authentication product. It owns a User identity, password credentials, opaque
sessions, typed request values, and transport-neutral authentication
operations without introducing authentication or a `user` authority mode in
Core.

Implementation would make durable security, storage, and developer-facing
choices. The exact User composition point, username and password policy,
password hashing implementation, session lifecycle, operation failures,
internal authority use, HTTP credential resolution, cookie behavior, and CSRF
boundary must therefore be fixed first.

Issue 2318 reviewed the contract with explicit user approval. It also proved
that normal schemas plus Master authority cannot keep verifier storage absent
from Query and Typegen. ADR-0234 consequently owns the required generic private
storage boundary, and issue 2322 must implement it before Password Auth starts.

## Decision

### One plugin owns one User identity domain

Password Auth v1 supports one instance per application. A second configured
instance is rejected during static compilation because the `User` identity,
principal request value, session resolver, and fixed operation names would be
ambiguous. Supporting multiple local identity domains requires a later contract
with distinct public identities and operation namespaces.

The package exports `PasswordUser`, a stable plugin-owned default schema with
logical class name `User`, and `PasswordUserSchema.define()` for an explicitly
compatible custom schema. `passwordAuthPlugin({ user: AppUser })` contributes
the exact custom class; omission contributes `PasswordUser`. The custom class
is final composition, not subclassing or prototype mutation, and adds ordinary
application fields beside the package-owned identity field.

Every Password Auth User contains one reserved `username` string field that is
required, unique, and immutable after creation. Custom declarations cannot
replace or redeclare it and cannot add fields named `password`, `passwordHash`,
`credential`, or `session`. Passwords and session tokens are operation inputs,
never User fields.

The User schema is visible to direct trusted server Query and Typegen because
it is the application's public identity model. Its plugin-owned provenance
keeps it private from automatic REST v1 CRUD generation and future generated
GraphQL schema routes. Authentication operations are its only automatic public
behavior. A later explicit profile or administration operation may expose safe
User data without exposing private records.

Direct trusted code can create an uncredentialed User, but only `signUp`
creates a login credential. V1 provides no attach-password, rename-username,
password-change, or recovery operation. Deleting a User cascades its private
credential and sessions through ADR-0234's portable reference integrity.

### Usernames have one canonical representation

Username processing applies these steps in order:

1. trim leading and trailing Unicode whitespace;
2. normalize with Unicode NFKC;
3. apply JavaScript's locale-independent Unicode lower-case conversion;
4. count and validate the resulting Unicode code points.

The canonical username contains 3 through 64 code points. Its first and last
characters are Unicode letters or numbers; middle characters may additionally
contain `.`, `_`, or `-`. Empty segments and repeated separators are accepted
because they create no identity ambiguity. `@`, whitespace, controls, and every
other punctuation character are rejected, so an email address never becomes a
v1 login identifier accidentally.

Both User and private credential storage retain the same canonical username.
The User field is immutable, and exact database uniqueness on the canonical
value resolves concurrent sign-up races. A separate custom `displayName` may
preserve presentation casing.

`signUp` maps malformed, unavailable, and conflicting usernames to the same
`PASSWORD_AUTH_SIGN_UP_REJECTED` result. `login` maps malformed, unknown, and
credential-less usernames plus incorrect passwords to
`PASSWORD_AUTH_INVALID_CREDENTIALS`. Public responses never state that a User
or credential exists.

### Password input is normalized once and retained only during the operation

Password Auth accepts a JavaScript string containing well-formed Unicode. It
applies NFC exactly once and then requires 15 through 256 Unicode code points.
It does not trim, change case, truncate, or impose upper-case, lower-case,
number, symbol, or periodic-change rules. Spaces and printable Unicode remain
valid.

The 15-character single-factor minimum, Unicode counting, lack of composition
rules, and support beyond 64 characters follow the current NIST SP 800-63B
guidance:

<https://pages.nist.gov/800-63-4/sp800-63b.html>

V1 does not include a compromised-password blocklist, rate limiter, MFA, or
alternative authenticator and therefore does not claim complete NIST
conformance. Applications must place an appropriate online-attempt defense in
front of public login routes when the separately scoped rate-limiting product
exists.

The submitted string may exist in the caller's input, Fetch body, operation
snapshot, and hashing implementation only for the duration of that call. It is
never retained in a User, private record, RequestContext, operation result,
error, diagnostic, log, hook, observer, event, serialization, or Typegen
declaration. Temporary byte buffers are overwritten in `finally` blocks.
JavaScript strings are immutable and cannot be reliably zeroed; the package
documents this runtime limit instead of promising impossible erasure.

### `argon2` owns password hashing until Node's native API is stable enough

The initial implementation uses the maintained `argon2` package reviewed at
version 0.45.1. It wraps the reference Argon2 implementation, supports Node 22
and later, publishes TypeScript declarations and prebuilt binaries for the
main Linux, Alpine, macOS, Windows, and FreeBSD targets, and supplies password-
focused PHC encoding, verification, and rehash detection:

<https://github.com/ranisalt/node-argon2>

Node 24.15 exposes `node:crypto` Argon2, but that API is still stability 1.2
release candidate and lacks PHC formatting, PHC verification, rehash detection,
and password-safe defaults. V1 does not build its own encoding around that
generic API:

<https://nodejs.org/download/release/v24.15.0/docs/api/crypto.html#cryptoargon2algorithm-parameters-callback>

The default password profile is Argon2id version 19 with 65,536 KiB memory,
three passes, four lanes, a fresh 16-byte salt, and a 32-byte tag. This is RFC
9106's second recommended profile for memory-constrained environments:

<https://www.rfc-editor.org/rfc/rfc9106.html#section-4>

Configuration may select a positive monotonic `policyVersion`, memory from
19,456 through 1,048,576 KiB, two through ten passes, and one through sixteen
lanes. It cannot go below OWASP's Argon2id minimum of 19 MiB, two passes, and
one lane:

<https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html>

The private credential record contains the canonical username, exact User
reference, encoded PHC verifier, and policy version. Every password receives an
independent library-generated salt. A successful login verifies the stored PHC
parameters. When its policy version is lower than the configured version, the
handler computes a new PHC verifier before entering the write transaction,
rechecks the unchanged credential inside that transaction, replaces it, and
creates the session atomically. Equal versions do not rewrite; a greater stored
version verifies without downgrade. Every parameter change requires a higher
policy version. V1 accepts only Argon2id version 19; adding another verifier is
a separate reviewed migration contract.

Native compilation and prebuilt-binary behavior are verified in source, built,
packed, supported-platform CI, and deployment documentation. Moving to stable
Node-native Argon2 later is an internal implementation change only if it
preserves PHC compatibility, parameters, verification, upgrade behavior, and
the packed-package matrix.

### Sessions are opaque, revocable, rotating, and application-local

Session creation generates 32 random bytes with Node's cryptographic random
source and returns `ub_s1.` followed by their base64url encoding. The token is
returned only by sign-up, login, or successful rotation. Private storage keeps
only SHA-256 of the complete versioned token; its 256 bits of random entropy
make a password-style slow hash or a second application secret unnecessary.

One private session record contains its stable session UUID, User reference,
token digest, creation time, rolling expiration, absolute expiration, optional
revocation time, and monotonic rotation version. The digest is unique. No raw
token enters Query, Typegen, hooks, events, diagnostics, request metadata, or a
RequestContext.

The default rolling lifetime is seven days and the default absolute lifetime
is thirty days. Configuration uses integer milliseconds: `expiresInMs` ranges
from five minutes through thirty days, `absoluteExpiresInMs` ranges from one
through 365 days, and the absolute value must be at least the rolling value.
Validation performs no last-used write and has no separate idle clock.

Refresh requires a currently valid session, generates a new token, increments
the rotation version, replaces the digest, and sets the new rolling expiration
to the earlier of `now + expiresInMs` and the unchanged absolute expiration.
It never revives an expired or revoked session. The update compares the old
digest and rotation version atomically, so exactly one concurrent refresh wins
and every loser receives `PASSWORD_AUTH_INVALID_SESSION`. The old token becomes
invalid at commit.

Multiple independent active sessions per User are allowed. Logout revokes only
the exact current session and never affects another session. V1 has no session
listing, device label, concurrent-session limit, logout-all, background cleanup,
or automatic client refresh. User deletion removes all owned credentials and
sessions through private reference cascade.

The private store belongs to one exact application and plugin instance. A
well-formed token issued by another application produces the same invalid-
session failure as a random token.

### Four operations own every credential transition

The package exports these nominal application operation tokens at version
`1.0.0`:

- `ultimabase.password-auth.sign-up`;
- `ultimabase.password-auth.login`;
- `ultimabase.password-auth.logout`;
- `ultimabase.password-auth.refresh`.

Sign-up and login accept the exact immutable input
`{ username: string, password: string }`. Their result is
`{ principal, session }`, where `principal` contains the exact typed User
pointer and `session` contains `id`, the one-time raw `token`, `expiresAt`, and
`absoluteExpiresAt`. Refresh accepts `null` and returns the same principal plus
the rotated session. Logout accepts `null` and returns `{ revoked: true }`.

Logout and refresh require the current validated Password Auth session in the
request context. Direct server code may instead call `runWithSession(token,
handler)`, which validates one raw token, enters one application-owned
asynchronous scope containing only safe principal and session values, and drops
its raw credential before invoking the handler.

The operations declare only these public failures:

| Code                                | REST status | Meaning                                       |
| ----------------------------------- | ----------- | --------------------------------------------- |
| `PASSWORD_AUTH_SIGN_UP_REJECTED`    | 400         | Sign-up input or identity was rejected.       |
| `PASSWORD_AUTH_INVALID_CREDENTIALS` | 401         | Login credentials were rejected.              |
| `PASSWORD_AUTH_INVALID_SESSION`     | 401         | Session credential or transition was invalid. |

Malformed REST envelopes remain REST errors. Unexpected hashing, storage,
audit, adapter, or Runtime failures remain sanitized internal errors and never
become a more detailed public Password Auth code.

For login, an absent User or credential runs one verification against a fixed
valid dummy Argon2id PHC value. Incorrect credentials and a stale concurrent
credential produce the same code, status, body shape, and no database write.
Timing is equalized where practical but is not claimed constant across network,
database, scheduler, or process noise. Sign-up validates and hashes before its
unique transaction so a canonical username race cannot leave partial state.

Sign-up hashes outside the transaction, then performs one audited Master
elevation and atomically creates the User, private credential, and initial
session. Login reads and verifies outside a transaction, then transactionally
rechecks the credential, optionally upgrades it, and creates a session. Logout
transactionally marks the exact active session revoked. Refresh performs its
compare-and-swap rotation in one transaction. Any failure rolls back the
complete mutation.

### Identity never becomes Core authority

Password Auth exports nominal immutable `PasswordPrincipal<TUser>` and
`PasswordSession` request-value tokens. The principal contains only the typed
User pointer. The session value contains only its UUID, creation and expiration
times, and rotation version. Neither contains a password, verifier, token,
Master grant, Access grant, role, ACL decision, or transport input.

A validated session derives a new RequestContext value while retaining Core
authority `anonymous`. Authentication establishes identity only. Access, ACL,
roles, and community policies consume Core's neutral subject contracts and
never import, identify, or trust Password Auth merely because it is installed.
Master and session identity may coexist in one request; the principal remains
available for audit while only the independently verified Master provenance
changes authority.

Password Auth declares `storage:private` for credentials and sessions. It also
declares `authority:elevate` because anonymous sign-up must create the public
User through the ordinary Runtime without depending on optional Access policy.
The application must configure `MasterAuthority` for sign-up. Anonymous
sign-up produces exactly one audit before User or private writes. Audit failure
aborts the operation without an effect. A caller-selected existing Master is
inherited without another elevation. Login, logout, refresh, session validation,
and `runWithSession()` use only owner-private storage and emit no Master audit.
The internal Master engine and provenance never enter the caller context or
operation result.

### Bearer is default and cookie mode owns its HTTP response

The default HTTP resolver accepts exactly one
`Authorization: Bearer <session-token>` credential. Missing credentials leave
the request anonymous. A present malformed, expired, revoked, foreign, or
unknown token fails before route dispatch through the protocol-neutral
`HTTP_APPLICATION_REJECTED` boundary. A single request containing both Bearer
and a configured session cookie is ambiguous and fails rather than choosing a
precedence.

The four operations remain private until the application explicitly lists
their tokens in `restPlugin({ operations })`. REST then uses the canonical
`POST /api/v1/operations/{namespacedOperation}` route and the status mapping
above. REST does not import or identify Password Auth.

Cookie transport is opt-in because an HttpOnly cookie must be written and
cleared by trusted server code. Configuration requires an explicit name
starting with `__Host-`. The session cookie always has `Secure`, `HttpOnly`,
`Path=/`, no `Domain`, and expiration matching the rolling session expiry.
`SameSite` defaults to `Lax`, may be `Strict`, and may be `None` only when the
effective ADR-0226 browser policy enables credentials for exact origins. A
wildcard origin is never compatible.

The generic REST codec returns JSON and cannot attach an owner-specific
`Set-Cookie` effect without coupling REST to authentication. Cookie mode
therefore contributes an explicit Password Auth HTTP route family at
`/auth/v1/sign-up`, `/auth/v1/login`, `/auth/v1/logout`, and
`/auth/v1/refresh`. These routes execute the same four Core operation tokens;
they add no parallel credential logic. Sign-up, login, and refresh set or rotate
the cookie and omit the raw token from JSON. Logout revokes the session and
expires the cookie. Route collision rejects startup.

Cookie-authenticated state changes require all existing HTTP proofs: exactly
one `X-UltimaBase-Application-Id`, `application/json`, exactly one non-null
`Origin` matching the effective explicit browser policy, and successful CORS
preflight when cross-origin. The mandatory application-ID custom header makes
simple cross-site form submission impossible; exact origin validation and the
credentialed browser policy provide the custom-header CSRF pattern recommended
for JSON APIs. No second CSRF secret or readable double-submit cookie is added.
`SameSite` is defense in depth, not the sole control:

<https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html>

Missing, duplicate, or rejected origin and credential evidence uses the same
safe pre-dispatch error family and does not reveal application, username, or
session validity. Non-browser and cross-site clients that cannot meet the
cookie contract use Bearer.

## Accepted developer examples

### Custom User and direct operation

```ts
import { MasterAuthority, Schema, UltimaBase } from '@ultimabase/core'
import {
	PasswordUserSchema,
	passwordAuthOperations,
	passwordAuthPlugin,
} from '@ultimabase/password-auth-plugin'

const AppUser = PasswordUserSchema.define({
	className: 'User',
	fields: (field) => ({
		displayName: field.string({ required: true }),
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

const authenticated = await ultimabase
	.operation(passwordAuthOperations.login)
	.execute({ username: 'Ada', password: 'correct horse battery staple' })
```

`PasswordUserSchema.define()` accepts the same ordinary schema options required
for the custom fields, but Password Auth owns the injected identity field and
contributes the final schema. The plugin implementation imports no PostgreSQL,
Access, REST, GraphQL, or Hono package.

### Explicit Bearer REST exposure

```ts
const authOperations = [
	passwordAuthOperations.signUp,
	passwordAuthOperations.login,
	passwordAuthOperations.logout,
	passwordAuthOperations.refresh,
] as const

const ultimabase = new UltimaBase({
	masterAuthority,
	plugins: [
		passwordAuthPlugin(),
		restPlugin({ operations: authOperations }),
		httpPlugin({ applicationId: 'notes' }),
		serverHonoPlugin(),
		postgresPlugin({ url: env.DATABASE_URL }),
	],
	schemas: [Post],
})
```

```ts
const loginResponse = await fetch(
	'https://api.example.com/api/v1/operations/ultimabase.password-auth.login',
	{
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-UltimaBase-Application-Id': 'notes',
		},
		body: JSON.stringify({
			input: {
				username: 'Ada',
				password: 'correct horse battery staple',
			},
		}),
	},
)

const { result } = await loginResponse.json()

const postsResponse = await fetch('https://api.example.com/api/v1/Post', {
	headers: {
		Authorization: `Bearer ${result.session.token}`,
		'X-UltimaBase-Application-Id': 'notes',
	},
})
```

### Explicit secure-cookie HTTP mode

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

```ts
await fetch('https://api.example.com/auth/v1/login', {
	method: 'POST',
	credentials: 'include',
	headers: {
		'Content-Type': 'application/json',
		'X-UltimaBase-Application-Id': 'notes',
	},
	body: JSON.stringify({
		username: 'Ada',
		password: 'correct horse battery staple',
	}),
})
```

The cookie response contains only the safe principal and session dates. The raw
session token exists only in `Set-Cookie`, which browser JavaScript cannot read.

## Consequences

- Installing Password Auth creates one explicit local identity product without
  changing Core authority or granting authorization.
- User fields retain normal typed application ergonomics while credentials and
  sessions remain strictly owner-private.
- Sign-up pays one mandatory Master audit; ordinary session resolution does
  not turn every request into Master or an audit write.
- The `argon2` native dependency adds packaging and deployment evidence but
  avoids custom cryptography and an unstable Node-native wrapper.
- Bearer proves the generic REST operation bridge. Cookie mode remains an
  explicitly separate HTTP integration because only its owner may emit the
  HttpOnly cookie effect.
- Password recovery, identifier changes, and stronger authenticators require
  explicit later products instead of widening v1 implicitly.

## Non-goals

- Email login, password change or recovery, email verification, MFA, OAuth,
  passkeys, HTTP Basic, Better Auth, device management, rate limiting, or a
  frontend SDK.
- A generic authentication engine, Core User schema, `user` authority mode,
  authentication grant, or auth-specific Access stage.
- Automatic REST or GraphQL exposure of User, credential, or session storage.
- Multiple Password Auth instances in one application.
- Claiming constant-time network behavior or complete NIST conformance.
