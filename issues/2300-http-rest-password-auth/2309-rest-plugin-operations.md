# 2309: Expose plugin operations through REST

- Status: planned
- Milestone: 23
- Packages: `@ultimabase/rest-plugin`, `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 2306, 2308
- ADR: ADR-0193, ADR-0206, ADR-0225 and the issue 2302 REST contract

## Goal

Bind explicitly selected plugin operations to REST without making declarations
public automatically or creating a second execution path.

## Acceptance criteria

- [ ] REST defines one nominal protocol identity and version using Core's public
      operation transport bridge.
- [ ] An operation is reachable only when its owner has active
      `transport:expose`, a compatible REST binding exists, and application
      exposure configuration selects the exact operation.
- [ ] Wire codecs decode and encode immutable values through the operation
      owner's declared input, result, and public error contracts.
- [ ] Namespaced operation routes cannot collide with schema, item, count, bulk,
      or another operation route.
- [ ] Operation transaction policy, Runtime middleware, protected constraints,
      callback attribution, cancellation, and application isolation remain
      unchanged.
- [ ] REST input cannot select Master, privileges, adapters, persistence plans,
      unexposed operations, or another application.
- [ ] Core's generic operation transport accepts anonymous, plugin-valued
      anonymous, and already verified Master contexts while its application
      binding rejects foreign, forged, stale, or wrong-authority Master
      contexts before decoding.
- [ ] Plugin-operation bodies enforce the accepted streaming size and media-type
      contract before codec decoding.
- [ ] Password Auth operations can later use this exact bridge without REST
      importing the password plugin.

## Tests

- [ ] Private, exposed, missing-binding, denied-privilege, incompatible-version,
      malformed-input, safe-error, duplicate-route, cancellation, deadline, and
      cross-application tests.
- [ ] Anonymous, session-valued anonymous, owning Master, foreign Master,
      forged Master, and wrong-authority context matrices pass.
- [ ] Source, built, packed, JavaScript, and generated TypeScript consumers use
      only public exports.

## Out of scope

- Declaring authentication operations or automatically exposing installed
  plugin operations.
