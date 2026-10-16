# Auth example

A small notes backend that shows Password Authentication end to end: a
`Member` User schema with its own fields, sign-up and login by email, the
session's member as the `principal` of Access rules, listing, revoking,
refreshing and ending sessions, the configured session lifetimes, recent
authentication before account deletion, password reset, email verification
and email change through a test email sender, authentication events,
attempt limiting, and the `/api/auth` routes with Bearer and cookie sessions.
A second, stricter application requires a verified email before any session
and raises the Argon2id parameters. It uses the declaration form
without generated files and is tested with `testApplication`.

The [Password Authentication page](../../apps/website/content/docs/1.0.0/plugins/official/password-authentication.mdx),
the [`auth-plugin` README](../../packages/auth-plugin/README.md) and the
[`auth-password` README](../../packages/auth-password/README.md) show this
application's code: each block is a `//#region <name>` of these files,
included by the page and copied into the READMEs by `yarn docs:regions`.
Change the code here, and the tests prove what the documentation
says.

## Files

| File                                               | What it shows                                                                                                                                |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/app.ts`](src/app.ts)                         | the factory `App` with Access, `authPlugin` (password by email, session lifetimes, cookie, events) and the API server                        |
| [`src/schema.ts`](src/schema.ts)                   | the `Member` User; `Note`                                                                                                                    |
| [`src/email-flows.ts`](src/email-flows.ts)         | the `reset`, `verification` and `emailChange` option groups of `password()`                                                                  |
| [`src/mailer.ts`](src/mailer.ts)                   | the test email sender: an outbox standing in for an email provider                                                                           |
| [`src/events.ts`](src/events.ts)                   | authentication event handlers writing to an in-memory security log                                                                           |
| [`src/strict.ts`](src/strict.ts)                   | a second application: `requireVerifiedEmail` and stronger hash parameters                                                                    |
| [`src/ultimabase.ts`](src/ultimabase.ts)           | the application and its `Register` declaration                                                                                               |
| [`src/main.ts`](src/main.ts)                       | the development entry point                                                                                                                  |
| [`tests/sign-up.test.ts`](tests/sign-up.test.ts)   | sign-up and login, rejected inputs, identical credential failures, server-side `createUser` and the protected email fields                   |
| [`tests/sessions.test.ts`](tests/sessions.test.ts) | the current member, the principal in Access rules, listing, revoking, refreshing and ending sessions, password change, server administration |
| [`tests/account.test.ts`](tests/account.test.ts)   | the session lifetimes, recent authentication and account deletion, linked methods                                                            |
| [`tests/email.test.ts`](tests/email.test.ts)       | password reset, token expiry, email verification, email change, and a reset cancelling a pending change                                      |
| [`tests/strict.test.ts`](tests/strict.test.ts)     | no session before verification                                                                                                               |
| [`tests/http.test.ts`](tests/http.test.ts)         | the `/api/auth` routes, Bearer and cookie sessions, HTTP statuses, attempt limiting and its events, counters cleared by a reset              |

Test credentials are fixed fake values defined in the tests. Region names are
stable identifiers: renaming one breaks the page or README that includes it,
and the website content tests report the missing region.

## Run and verify it

Build the repository packages once, then from the repository root:

```sh
corepack yarn build
corepack yarn workspace @ultimabase/example-auth typecheck
corepack yarn workspace @ultimabase/example-auth test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultimabase_auth \
	corepack yarn workspace @ultimabase/example-auth start
```

`test` starts PostgreSQL in a container once (Docker), or uses
`TEST_DATABASE_URL`. `start` serves the authentication routes on
`http://127.0.0.1:1337/api/auth` and REST on
`http://127.0.0.1:1337/api/classes/Note`; the outbox only collects emails in
memory. The PostgreSQL `override` schema policy (the default outside
production) is convenient for this development example and is not a
production migration strategy.
