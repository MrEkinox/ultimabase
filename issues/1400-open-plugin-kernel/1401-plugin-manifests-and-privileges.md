# 1401: Add plugin manifests and declared privileges

- Status: completed
- Milestone: 14
- Packages: `@ultimabase/core`
- Depends on: 1303
- ADR: ADR-0186, ADR-0190, ADR-0191

## Goal

Extend immutable plugin definitions with stable package and instance identity,
versioned compatibility metadata, exact privileges, and environmental claims
without running plugin callbacks.

## Acceptance criteria

- [x] Core exports the complete closed `PluginPrivilege` vocabulary from ADR-0191 with documented severity and facade ownership.
- [x] `definePlugin` snapshots a namespaced plugin ID, optional explicit instance ID, non-empty semantic version, supported Core range, requested privileges with reasons, and environmental claims.
- [x] The same plugin may be configured several times only through distinct explicit instance IDs; duplicate structured identities fail without concatenated string keys.
- [x] Plugin manifests request concrete privileges only; wildcard requests and malformed names fail.
- [x] Enforceable privileges remain distinct from informational Node.js environment claims in types, inspection, and documentation.
- [x] Nested plugins retain their own manifests and never inherit a parent's privileges.
- [x] Runtime definition callbacks and setup exports remain private and are not executed while manifests are inspected.
- [x] Public option interfaces have English JSDoc and focused examples.

## Tests

- [x] Runtime tests cover normalization, immutability, malformed JavaScript input, duplicate and distinct instances, nested definitions, privilege reasons, claims, and severity.
- [x] Type and language-service tests cover exact privilege literals, autocomplete, hovers, and packed Core exports.

## Out of scope

- Enforcing an application privilege policy; issue 1402 owns that work.
- Sandboxing plugin module evaluation or Node.js process permissions.
