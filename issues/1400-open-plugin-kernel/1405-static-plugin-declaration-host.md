# 1405: Open the static plugin declaration host

- Status: completed
- Milestone: 14
- Packages: `@ultimabase/core`
- Depends on: 1415
- ADR: ADR-0186, ADR-0187, ADR-0190, ADR-0191, ADR-0192

## Goal

Replace the FieldBuilder-only declaration callback with one privilege-scoped
static host that can collect every application declaration before schema
compilation.

## Approved bounded interpretation

This issue delivers the canonical owner-bound declaration phase without
pre-empting the domain contracts owned by issues 1406 through 1408:

- `declare(...)` replaces `declareFields(...)` and exposes the existing field
  declaration registrar only with active `schema:declare` authority;
- the context may read only exact manifest requirements whose capability has
  `declaration` lifetime; application capability values remain setup-only;
- the internal host is deliberately extensible by later issues, but does not
  publish empty schema, patch, model, operation, or Typegen facades before their
  descriptor contracts exist;
- Core supplies no setup resource, adapter, request, clock, network state, or
  secret to the callback. Installed plugins remain trusted in-process code, so
  Core cannot prevent a plugin factory closure from reading Node.js state;
- only validated immutable contribution snapshots may enter later compilation
  and fingerprint inputs.

In the acceptance criteria below, supporting the later declaration categories
means that the canonical host and its transactional ownership boundary can add
their exact facades without introducing another callback or registry. The
category-specific public registrars and execution semantics remain owned by
their listed follow-up issues.

## Acceptance criteria

- [x] Plugin definitions expose one synchronous static declaration callback with exact facades selected by allowed privileges.
- [x] The host supports schemas, field methods and kinds, complete option namespace descriptors, patches, model handles, operations, declaration capabilities, and Typegen descriptors without exposing setup resources.
- [x] Existing `declareFields` behavior migrates to the canonical host and the superseded callback is removed in the same change.
- [x] Static and runtime plugin options are separated internally so secrets, services, clocks, network state, and adapters cannot enter declaration inputs or fingerprints accidentally.
- [x] Contributions remain owner- and instance-bound, ordered, immutable, all-or-nothing, and isolated per application.
- [x] Returning a promise, using a closed facade, or registering after compilation fails before setup.

## Tests

- [x] Runtime tests cover phase order, privilege-scoped facades, deterministic repeats, failure atomicity, late registration, and two applications.
- [x] Type and language-service tests protect exact callback contexts, JSDoc, removed legacy declarations, and packed exports.

## Out of scope

- Applying schema patches; issue 1406 owns transformation semantics.
- Executing Typegen or Runtime contributions.
