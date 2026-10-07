# 2309: Expose plugin operations through REST

- Status: completed
- Milestone: 23
- Packages: `@ultimabase/rest-plugin`, `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 2306, 2308
- ADR: ADR-0193, ADR-0206, ADR-0225, ADR-0228, and ADR-0233

## Goal

Bind explicitly selected plugin operations to REST without making declarations
public automatically or creating a second execution path.

## Acceptance criteria

- [x] REST defines one nominal protocol identity and version using Core's public
      operation transport bridge.
- [x] An operation is reachable only when its owner has active
      `transport:expose`, a compatible REST binding exists, and application
      exposure configuration selects the exact operation.
- [x] Wire codecs decode and encode immutable values through the operation
      owner's declared input, result, and public error contracts.
- [x] Namespaced operation routes cannot collide with schema, item, count, bulk,
      or another operation route.
- [x] Operation transaction policy, Runtime middleware, protected constraints,
      callback attribution, cancellation, and application isolation remain
      unchanged.
- [x] REST input cannot select Master, privileges, adapters, persistence plans,
      unexposed operations, or another application.
- [x] Core's generic operation transport accepts anonymous, plugin-valued
      anonymous, and already verified Master contexts while its application
      binding rejects foreign, forged, stale, or wrong-authority Master
      contexts before decoding.
- [x] Plugin-operation bodies enforce the accepted streaming size and media-type
      contract before codec decoding.
- [x] Password Auth operations can later use this exact bridge without REST
      importing the password plugin.

## Tests

- [x] Private, exposed, missing-binding, denied-privilege, incompatible-version,
      malformed-input, safe-error, duplicate-route, cancellation, deadline, and
      cross-application tests.
- [x] Anonymous, session-valued anonymous, owning Master, foreign Master,
      forged Master, and wrong-authority context matrices pass.
- [x] Source, built, packed, JavaScript, and generated TypeScript consumers use
      only public exports.

## Out of scope

- Declaring authentication operations or automatically exposing installed
  plugin operations.

## Verification

- Focused Core and REST runtime suites passed, including protocol identity,
  metadata snapshots, route exposure, contexts, failures, cancellation, and
  lifecycle restart.
- `yarn constraints`, `yarn check:issues`, `yarn format:check`,
  `yarn typecheck`, `yarn test`, `yarn lint`, and `yarn build` passed. Lint
  retained 76 pre-existing centralized line-budget warnings and no errors.
- Built package checks passed for 21 files and 111 tests; complete E2E and
  PostgreSQL checks passed for 55 files and 220 tests.
