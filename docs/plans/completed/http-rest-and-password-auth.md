# HTTP, REST, and password authentication

- Status: completed
- Milestone: 23
- Completed: 2026-09-07
- Governing decisions: ADR-0224 through ADR-0237

## Objective

Deliver the first public client-to-PostgreSQL vertical through optional HTTP,
Hono, REST, and Password Auth plugins while preserving one Runtime pipeline,
application-owned audited Master authority, optional policy engines, and a
network-independent GraphQL boundary.

## Completed order

1. Issues 2301, 2321, and 2302 accepted the package, browser, pre-dispatch, and
   experimental REST v1 boundaries.
2. Issues 2319, 2303, 2304, 2305, and 2317 delivered Core request execution,
   the HTTP application, Master contexts, Hono, and browser policy.
3. Issues 2306 through 2311 and 2320 delivered REST metadata, reads, mutations,
   plugin operations, responses, errors, and the anonymous/Master vertical.
4. Issues 2318, 2322, and 2312 through 2314 delivered the Password Auth
   contract, owner-private storage, local identities, sessions, operations,
   Bearer resolution, and secure cookie routes.
5. Issue 2315 proved the authenticated role- and ACL-protected REST vertical;
   issue 2316 reconciled repository truth and ran the final gate.

## Outcome

`@ultimabase/http-plugin` owns application selection, Fetch route composition,
credential resolver composition, safe pre-dispatch errors, browser policy, and
the audited raw-Master exchange. `@ultimabase/server-hono-plugin` owns only Hono
and network lifecycle. `@ultimabase/rest-plugin` owns the experimental REST v1
wire surface and delegates logical reads, mutations, and explicitly selected
plugin operations through Core's narrow application request executor.

`@ultimabase/password-auth-plugin` owns its typed User schema, canonical local
credentials, Argon2id verifiers, opaque revocable sessions, four
transport-neutral operations, Bearer resolution, and optional secure cookies.
Credential and session records remain owner-private and cannot enter Query,
Typegen, generated schema routes, unrelated plugins, or request values.
Authentication contributes a typed principal but grants no authorization and
does not add a Core authority mode.

The public minimal example composes Password Auth, Roles, Access, ACL, Hooks,
Validation, HTTP, Hono, REST, and PostgreSQL only through package exports. Its
tests cover anonymous, authenticated, authenticated-plus-Master, invalid and
revoked sessions, invalid Master, cross-application isolation, policy denial,
browser Fetch, cookie CSRF boundaries, and audited Master provenance.

Applications that install none of these products retain the measured baseline:
one Runtime assembly, zero optional behavior or enforcement bundles and stages,
and zero optional stage calls across one read and one mutation.

## Verification

Environment: Node.js 24.20.0, Yarn 4.9.2, Darwin 24.6.0 x86_64, Docker Desktop
29.7.2 using the `desktop-linux` context, and PostgreSQL `17-alpine` through
Testcontainers.

- `yarn constraints` passed.
- `yarn check:issues` — 1 file and 9 tests passed.
- `yarn typecheck` passed with no TypeScript errors.
- `yarn test` — 406 files and 1,950 tests passed with no type errors.
- `yarn lint` — zero errors; 77 reviewed historical line-budget warnings.
- `yarn format:check` passed.
- `yarn build` — every publishable workspace passed declarations, ATTW, and
  publint.
- `yarn test:pack:built` — 23 files and 118 tests passed.
- `yarn test:e2e:built` — 63 files and 247 tests passed, including Chromium,
  Hono, and PostgreSQL Testcontainers.
- `yarn test:coverage` — 468 files and 2,141 tests passed with no type errors.
  Coverage finished at 88.73% statements, 81.58% branches, 94.55% functions,
  and 89.08% lines.

The initial unconstrained coverage run produced 23 timeouts in concurrent
TypeScript language-service tests on this Intel host, with no failed assertion
or type error. The canonical coverage script now caps execution at four workers;
the exact documented command then passed. No product limitation remains.

## Known boundaries and next work

REST v1 remains experimental and deliberately uses limit/offset pagination.
Public protection diagnostics cannot infer complete policy coverage. GraphQL,
Yoga, HTTP Basic, Better Auth, OpenAPI, SDKs, uploads, realtime, and deployment
automation remain outside this completed milestone.

[Issue 608](../../../issues/600-transports/608-graphql-v1-contract.md) is ready
and is the next independent transport starting point. The GraphQL backlog was
subsequently rebased on the completed milestone 23 contracts, so this issue now
accepts the GraphQL v1 architecture before the network-independent package is
implemented.
