# Current plan: HTTP, REST, and password authentication

- Status: active
- Milestone: 23
- Started: 2026-09-03
- Governing decisions: [ADR-0224](docs/adr/0224-http-application-rest-and-password-auth-boundaries.md), [ADR-0225](docs/adr/0225-core-application-request-execution-capability.md), and [ADR-0226](docs/adr/0226-http-browser-and-predispatch-boundaries.md)
- Resume point: [issue 2302](issues/2300-http-rest-password-auth/2302-rest-v1-wire-contract.md)

## Objective

Deliver the first complete public client-to-PostgreSQL vertical through
optional official HTTP, Hono, REST, and Password Auth plugins. Preserve one
logical Query and Operation AST, one Runtime pipeline, application-owned
audited Master authority, optional policy engines, application isolation, and
network-independent GraphQL.

## Accepted target

```text
server-hono-plugin ────────────────┐
rest-plugin ───────────────────────┤
password-auth-plugin HTTP resolver ├──→ http-plugin
graphql-yoga-plugin later ─────────┘         │
             │                              ↓
             └──→ graphql-plugin      application request executor
                         │                    │
                         └──────────→ Core capability and Runtime kernel
```

- Every HTTP application request carries `X-UltimaBase-Application-Id`;
  infrastructure-only browser preflight is the sole configured exception.
- The public application ID selects one mounted application but grants no
  permission and is not a secret.
- An explicitly enabled `X-UltimaBase-Master-Key` is verified only by that
  application's Core `MasterAuthority`, audited, and exchanged for private
  application-owned provenance before transport execution.
- REST and GraphQL are siblings and may be installed together or separately.
- REST ships before authentication; Password Auth then proves the first
  authenticated public vertical; GraphQL follows without becoming a dependency.
- Password Auth uses username/password operations to establish opaque sessions,
  Bearer by default, and an explicit secure-cookie option.
- Cross-origin browser access is disabled by default and preflight never
  selects an application, resolves credentials, or invokes Runtime behavior.
- Applications sharing one server must use one structurally identical browser
  policy; a conflict rejects only the new mount before its route or listener
  effects and leaves existing mounts unchanged.
- HTTP Basic and Better Auth remain separate deferred plugins. No generic
  authentication engine package is created without proven shared behavior.

## Execution order

1. [x] Issue 2301 — accept package, identity, Master, auth, and sequencing boundaries.
2. [x] Issue 2321 — accept browser-policy and pre-dispatch HTTP boundaries.
3. [ ] Issue 2302 — decide the exact experimental HTTP and REST v1 wire contract.
4. [ ] Issue 2319 — implement the Core application request execution capability.
5. [ ] Issue 2303 — implement the HTTP application capability.
6. [ ] Issue 2304 — implement HTTP contexts and audited Master verification.
7. [ ] Issue 2305 — implement the Hono server provider.
8. [ ] Issue 2317 — implement the explicit HTTP browser boundary.
9. [ ] Issue 2306 — generate REST route metadata.
10. [ ] Issue 2307 — normalize REST reads and queries.
11. [ ] Issue 2320 — execute REST schema reads.
12. [ ] Issue 2308 — execute REST schema mutations.
13. [ ] Issue 2309 — expose selected plugin operations through REST.
14. [ ] Issue 2310 — stabilize REST responses and errors.
15. [ ] Issue 2311 — prove the anonymous and Master REST vertical.
16. [ ] Issue 2318 — decide the exact Password Auth v1 contract.
17. [ ] Issue 2312 — implement local password identities.
18. [ ] Issue 2313 — implement opaque sessions and auth operations.
19. [ ] Issue 2314 — bind Bearer and optional cookie sessions to HTTP contexts.
20. [ ] Issue 2315 — prove the authenticated REST vertical.
21. [ ] Issue 2316 — run the final audit and close the milestone.

The authoritative acceptance criteria and dependency metadata live in
[`issues/2300-http-rest-password-auth/`](issues/2300-http-rest-password-auth/).

## Resume protocol

On every resumed task:

1. Read `AGENTS.md`, this file, ADR-0224 through ADR-0226, the milestone README,
   and the current issue completely.
2. Check the current issue status and all dependency statuses before editing.
3. Inspect the working tree and preserve unrelated changes.
4. Keep implementation inside the selected issue, its tests, public
   documentation, and required generated artifacts.
5. Run the narrowest relevant checks before repository-wide verification.
6. Update the issue and this checklist only after its acceptance criteria are
   actually satisfied.
7. Create one dedicated commit after explicit approval and never push without a
   separate explicit request.

## Mandatory stop boundaries

- Stop during issue 2302 for explicit user approval of paths, verbs, query
  encoding, application-owned and plugin-owned route defaults, shared-server
  assembly and ownership, sensitive-header multiplicity proof, early HTTP and
  REST envelopes, request limits, and versioning before accepting its ADR.
- Stop during issue 2318 for explicit user approval of the User schema,
  username, password, session, internal credential-storage execution, cookie,
  and CSRF contract before accepting its ADR.
- Stop before any new Core authority mode, unaudited Master route, client key,
  read-only or scoped Master credential, generic auth engine, or secret-bearing
  context value.
- Stop if HTTP, REST, GraphQL, Password Auth, Access, Hono, or PostgreSQL would
  need a forbidden dependency or a parallel registry outside the capability
  host.
- Stop if the transport request executor would expose an engine, application,
  adapter, pipeline, authority, grant, transaction control, or lifecycle
  mutation instead of ADR-0225's narrow facade.
- Stop before selecting or adding a password-hashing dependency without the
  current evidence and explicit approval required by issue 2318.
- Stop if an issue expands into password recovery, email verification, MFA,
  OAuth, HTTP Basic, Better Auth, rate limiting, OpenAPI, SDK, files, realtime,
  or deployment automation.

## Completion and handoff

At milestone completion, move this plan to `docs/plans/completed/`, mark issue
2316 and the milestone completed, update the roadmap and package documentation,
and identify GraphQL issue 608 as the next independent transport starting point
unless the user selects another objective.
