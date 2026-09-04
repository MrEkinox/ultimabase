# 2321: Decide HTTP browser and pre-dispatch boundaries

- Status: completed
- Milestone: 23
- Packages: architecture documentation
- Depends on: 2301
- ADR: ADR-0226

## Goal

Fix the server-wide browser policy and early HTTP failure ownership before Hono
or REST creates ambiguous multi-application behavior.

## Acceptance criteria

- [x] ADR-0226 establishes one effective browser policy per server provider and
      rejects mismatched policies across mounted applications.
- [x] Cross-origin support is disabled by default and an externally managed
      server has one explicit CORS owner.
- [x] Preflight is application-free and invokes no context, credential, audit,
      route, Runtime, hook, policy, operation, or adapter behavior.
- [x] Wildcard origins cannot compose with credential-enabled browser access.
- [x] Every real application request still requires its canonical application
      ID and full authority resolution.
- [x] The HTTP plugin owns safe protocol-neutral errors before route dispatch;
      selected transports own errors only after their handler starts.
- [x] Duplicate security-sensitive headers fail closed and streaming body limits
      do not trust `Content-Length` alone.
- [x] CORS is explicitly not authentication, authorization, CSRF protection, or
      a non-browser security boundary.

## Tests

- [x] `yarn check:issues` validates the decision issue and dependencies.
- [x] Focused active-contract and backlog metadata tests pass.
- [x] `yarn format:check` and `git diff --check` pass.

## Completion evidence

- `yarn constraints` passed.
- `yarn check:issues` — 1 file and 9 tests passed.
- Focused active-documentation and backlog verification — 2 files and 14 tests
  passed.
- `yarn format:check` and `git diff --check` passed.

## Out of scope

- Implementing CORS, HTTP errors, request parsing, Hono, REST, cookie CSRF, rate
  limiting, TLS, proxy trust, compression, CSP, or deployment behavior.
