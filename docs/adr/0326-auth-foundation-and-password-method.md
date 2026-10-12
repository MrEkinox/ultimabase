# ADR-0326: Authentication foundation, password method and account lifecycle

- Status: accepted
- Date: 2026-10-12
- Refines: the Password Auth records, ADR-0297 (form D, amendment 3 on plugin schema factories),
  ADR-0304 (principal provider), ADR-0316 (`definePlugin`, schema factories of 6.3), ADR-0318
  (best-effort events), ADR-0323 (HTTP rate limiting), ADR-0324 and ADR-0325 (public operations);
  applies ADR-0288
- Approval: decisions of the authentication review (`docs/handoff/revue-plugins/password-auth.md`:
  decisions 1 to 9, the foundation and methods restructuring, account linking, and added
  features 1 to 6, 8 and 9, validated by the user on 2026-10-09); record accepted by the user on 2026-10-12 (OAuth as its own record after the migration; method package `@ultimabase/auth-password`)
- Already implemented elsewhere: the plugin provides the Core principal (ADR-0304), public
  operations and `hide` (ADR-0324), typed GraphQL for public operations (ADR-0325)

## Context

`password-auth-plugin` owns the user schema (with a fixed `User` class name declared twice
through `Base` then `Base.use(auth)`), sessions, the HTTP transport and the password method in one
package. The review decided a foundation with separate methods so that OAuth and community
methods (magic link, passkeys) attach accounts to the same user, plus account features missing
today: email login, password reset, email verification, attempt limiting, session management,
events, password and email change, and account deletion.

## Decision

**Foundation `@ultimabase/auth-plugin`.**

1. `authPlugin({ methods: [password({ identifier: 'email' })], session, linking })` owns the user
   schema factory `App.UserSchema.define({ className, fields })` (form D, free class name, one per
   plugin instance), sessions shared by every method, the Core principal provider, the HTTP
   transport (`Bearer` and cookie under one route prefix, the cookie mode only changing the
   response, `__Host-` cookie kept) and account linking. Results are typed `Model<"TodoUser">`
   (`signUp`, `login`, `current`). Sign-up uses the plugin's declared elevation privilege, not
   `MasterAuthority`, and a missing required field is named in the error.
2. **Methods** are separate packages that depend on the foundation and never on each other. The
   password method moves into `@ultimabase/auth-password` (`password({ identifier: 'username' |
'email', policy })`; Argon2id and `policyVersion` kept; `email` adds a unique, normalized,
   format-validated field). `@ultimabase/password-auth-plugin` is removed.
3. **Account linking** in a private collection: one row per `{ user, method, providerUserId, … }`
   with a unique index on `(method, providerUserId)`, provider secrets never in the user row,
   several accounts per method allowed, a function listing a user's linked methods, and
   `linking: 'verified-email' | 'manual'` (default `'verified-email'`: automatic linking only when
   both sides have a verified email). A user can never remove their last method.

**Account features.**

4. **Attempt limiting.** Per account in the database (growing delays, reset on success, shared
   between servers) and per account and client address (so an attacker cannot lock a victim out);
   the global per-address limit stays in the HTTP plugin.
5. **Sessions.** `listSessions()` (device, address, created, last used), `revokeSession(id)`,
   `logoutEverywhere()`; for Master `auth.listSessions(user)` and `auth.revokeSessions(user)`;
   `revokeOnPasswordChange` on by default.
6. **Password reset.** `requestPasswordReset({ email })` answers the same whether the account
   exists or not; `resetPassword({ token, newPassword })` with a random single-use token stored
   hashed, short expiry (1 hour by default), new tokens cancelling older ones, every session
   revoked after a reset, attempt limiting, and an application callback `sendResetEmail`.
7. **Email verification.** The foundation adds `emailVerified` and its date; `sendVerificationEmail`
   callback and `verifyEmail({ token })`; optional `requireVerifiedEmail`; an email guaranteed by a
   provider or a successful reset counts as verified.
8. **Changes and deletion with recent re-authentication.** `changePassword({ currentPassword,
newPassword })` (other sessions revoked); `requestEmailChange({ currentPassword, newEmail })`
   then confirmation on the new address and notification of the old one; `deleteAccount()`
   revoking sessions and removing linked accounts and secrets. Sensitive operations require the
   current password or a login younger than a few minutes (for users without a password).
9. **Events** `afterSignUp`, `afterLogin`, `afterLoginFailed`, `afterLogout`, `afterPasswordReset`,
   `afterEmailVerified`, `afterEmailChanged`: typed payloads without secrets, best effort
   (ADR-0318), consumable by the application.
10. UltimaBase sends no email: every message goes through an application callback.

## Consequences

- Public operations are declared by the foundation and by each method; transports expose them
  (ADR-0324) and applications hide what they do not want. create-app, the examples and the
  website move to `authPlugin` and `password()`.
- Implementation in two sub-steps: 6.4a (foundation, password method, linking, limiting, sessions,
  password change, deletion, events) and 6.4b (reset, email verification, email change).
- Tests: factory typing on TypeScript 6 and 7, principal, cookie and bearer under one prefix,
  linking rules and the last-method guard, limiting per account and per account and address
  across two application instances, each session operation, reset and verification token rules
  (single use, expiry, replacement, hashing), identical reset answers, re-authentication windows,
  deletion, events without secrets; DX audit and form D bench.
- Documentation impact: both (authentication pages, READMEs, security guide, create-app).

## Out of scope

OAuth (Google, GitHub, OpenID Connect, mobile ID tokens: its own record after the migration),
two-factor authentication and passkeys (later methods), sending emails.
