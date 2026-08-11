# 1403: Add versioned capability tokens and requirements

- Status: planned
- Milestone: 14
- Packages: `@ultimabase/core`
- Depends on: 1401
- ADR: ADR-0186, ADR-0190

## Goal

Define immutable application capability identities whose protocol version and
cardinality let plugins depend on behavior instead of concrete package names.

## Acceptance criteria

- [ ] `defineCapability` creates nominal namespaced tokens with an explicit protocol version, `single`, `multiple`, or `pipeline` cardinality, and `declaration` or `application` lifetime.
- [ ] Plugin manifests can provide or require exact typed capabilities and compatible version ranges.
- [ ] Capability requirements remain distinct from named plugin dependencies and optional dependencies.
- [ ] Named dependencies support semantic plugin ranges and optional exact instance targeting; capability requirements remain preferred for interchangeable providers.
- [ ] Optional capability reads must be declared and cannot probe arbitrary installed providers.
- [ ] Plugin manifests may condition optional privilege requests on one declared compatible capability; inactive requests remain inspectable without becoming enforceable.
- [ ] Tokens expose precise provider and consumer types without `any` or structural forgery.
- [ ] Duplicate incompatible token identities fail with owner and version diagnostics.
- [ ] Capability metadata remains static, serializable for inspection, and application-local at resolution time.

## Tests

- [ ] Runtime tests cover token validation, protocol versions, both lifetimes, cardinalities, named dependency ranges, optional reads, capability-conditioned privileges, duplicate identities, and forged values.
- [ ] Type and packed language-service tests cover provider inference, requirements, exact values, autocomplete, and no deep imports.

## Out of scope

- Provider composition, decoration, and replacement; issue 1404 owns them.
- A general semantic-version package if a suitable established parser already satisfies the contract.
