# 1405: Open the static plugin declaration host

- Status: planned
- Milestone: 14
- Packages: `@ultimabase/core`
- Depends on: 1415
- ADR: ADR-0186, ADR-0187, ADR-0190, ADR-0191, ADR-0192

## Goal

Replace the FieldBuilder-only declaration callback with one privilege-scoped
static host that can collect every application declaration before schema
compilation.

## Acceptance criteria

- [ ] Plugin definitions expose one synchronous static declaration callback with exact facades selected by allowed privileges.
- [ ] The host supports schemas, field methods and kinds, complete option namespace descriptors, patches, model handles, operations, declaration capabilities, and Typegen descriptors without exposing setup resources.
- [ ] Existing `declareFields` behavior migrates to the canonical host and the superseded callback is removed in the same change.
- [ ] Static and runtime plugin options are separated internally so secrets, services, clocks, network state, and adapters cannot enter declaration inputs or fingerprints accidentally.
- [ ] Contributions remain owner- and instance-bound, ordered, immutable, all-or-nothing, and isolated per application.
- [ ] Returning a promise, using a closed facade, or registering after compilation fails before setup.

## Tests

- [ ] Runtime tests cover phase order, privilege-scoped facades, deterministic repeats, failure atomicity, late registration, and two applications.
- [ ] Type and language-service tests protect exact callback contexts, JSDoc, removed legacy declarations, and packed exports.

## Out of scope

- Applying schema patches; issue 1406 owns transformation semantics.
- Executing Typegen or Runtime contributions.
