# 1401: Add plugin manifests and declared privileges

- Status: ready
- Milestone: 14
- Packages: `@ultimabase/core`
- Depends on: 1303
- ADR: ADR-0186, ADR-0190, ADR-0191

## Goal

Extend immutable plugin definitions with stable package and instance identity,
versioned compatibility metadata, exact privileges, and environmental claims
without running plugin callbacks.

## Acceptance criteria

- [ ] Core exports the complete closed `PluginPrivilege` vocabulary from ADR-0191 with documented severity and facade ownership.
- [ ] `definePlugin` snapshots a namespaced plugin ID, optional explicit instance ID, non-empty semantic version, supported Core range, requested privileges with reasons, environmental claims, and capability-conditioned optional privileges.
- [ ] The same plugin may be configured several times only through distinct explicit instance IDs; duplicate structured identities fail without concatenated string keys.
- [ ] Plugin manifests request concrete privileges only; wildcard requests and malformed names fail.
- [ ] Enforceable privileges remain distinct from informational Node.js environment claims in types, inspection, and documentation.
- [ ] Nested plugins retain their own manifests and never inherit a parent's privileges.
- [ ] Runtime definition callbacks and setup exports remain private and are not executed while manifests are inspected.
- [ ] Public option interfaces have English JSDoc and focused examples.

## Tests

- [ ] Runtime tests cover normalization, immutability, malformed JavaScript input, duplicate and distinct instances, nested definitions, privilege reasons, claims, severity, and conditional requests.
- [ ] Type and language-service tests cover exact privilege literals, autocomplete, hovers, and packed Core exports.

## Out of scope

- Enforcing an application privilege policy; issue 1402 owns that work.
- Sandboxing plugin module evaluation or Node.js process permissions.
