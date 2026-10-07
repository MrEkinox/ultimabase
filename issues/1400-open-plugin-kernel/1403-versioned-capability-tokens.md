# 1403: Add versioned capability tokens and requirements

- Status: completed
- Milestone: 14
- Packages: `@ultimabase/core`
- Depends on: 1401
- ADR: ADR-0186, ADR-0190

## Goal

Define immutable application capability identities whose protocol version and
cardinality let plugins depend on behavior instead of concrete package names.

## Acceptance criteria

- [x] `defineCapability` creates nominal namespaced tokens with an explicit protocol version, `single`, `multiple`, or `pipeline` cardinality, and `declaration` or `application` lifetime.
- [x] Plugin manifests declare exact typed providers plus required or optional capability requirements with compatible version ranges.
- [x] Capability requirements remain distinct from named plugin dependencies and optional dependencies.
- [x] Named dependencies support semantic plugin ranges and optional exact instance targeting; capability requirements remain preferred for interchangeable providers.
- [x] Optional capability use must be declared in the manifest; the read-only host delivered by 1404 rejects undeclared access instead of permitting provider probes.
- [x] Plugin manifests may condition optional privilege requests on one declared compatible capability; inactive requests remain inspectable without becoming enforceable.
- [x] Tokens expose precise provider and consumer types without `any` or structural forgery.
- [x] Declaration providers snapshot exact immutable serializable values; application providers declare only their exact value type and static ownership until 1404 supplies the privileged factory context.
- [x] Duplicate incompatible token identities fail with owner and version diagnostics.
- [x] Capability metadata remains static, serializable for inspection, and application-local at resolution time.

## Tests

- [x] Runtime tests cover token validation, protocol versions, both lifetimes, cardinalities, named dependency ranges, optional declarations, capability-conditioned privileges, duplicate identities, inert application providers, and forged values.
- [x] Type and packed language-service tests cover provider inference, requirements, exact values, autocomplete, and no deep imports.

## Out of scope

- Provider selection, composition, decoration, replacement, materialization, disposal, and consumer reads; issue 1404 owns them.
- A general semantic-version package if a suitable established parser already satisfies the contract.
