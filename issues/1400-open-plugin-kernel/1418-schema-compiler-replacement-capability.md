# 1418: Replace the complete schema compiler through a versioned capability

- Status: planned
- Milestone: 14
- Packages: `@ultimabase/core`
- Depends on: 1406
- ADR: ADR-0187, ADR-0190, ADR-0191, ADR-0192

## Goal

Expose one exceptional, complete, versioned schema-compiler replacement
protocol without allowing ordinary schema patches to bypass Core ownership,
identity, provenance, or portability invariants.

## Acceptance criteria

- [ ] Core defines one public declaration-lifetime schema-compiler capability with a documented protocol version and its current compiler as the canonical provider.
- [ ] A plugin requesting `schema:replace` can replace only the complete compatible compiler provider; ordinary `schema:transform` and generic callbacks cannot replace compiler stages or protected identities.
- [ ] The replacement receives one immutable callback-free snapshot of developer declarations, ordered plugin declarations, selectors, patches, owners, contribution identities, protocol versions, and normalized static options.
- [ ] The replacement returns one immutable logical graph through a validated public contract rather than mutating schema classes, registries, declarations, or another application's graph.
- [ ] Core always revalidates application ownership, stable class identity, Core system fields, operation identity, relationship targets, contribution provenance, and the minimum portable schema contract after replacement.
- [ ] Version mismatch, missing or stale replacement targets, competing replacements, malformed output, partial replacement, and replacement cycles fail deterministically before plugin setup.
- [ ] Replacement provenance identifies the exact plugin and instance, package version, capability protocol version, contribution identity, target provider, and normalized static options.
- [ ] Typegen and JavaScript consume the same final replaced logical graph without generated Runtime code or infrastructure during static compilation.

## Tests

- [ ] Runtime tests cover successful complete replacement, exact replacement chains, two explicit instances, ordering, malformed output, protected-invariant failures, application isolation, and stable repeat compilation.
- [ ] Type and packed tests prove the public capability contract, exact privilege boundary, version compatibility, and absence of private imports or generic callback escape hatches.

## Out of scope

- Ordinary schema additions and patches; issue 1406 owns them.
- Dynamic schema, model, and operation handles; issue 1407 owns them.
- Typegen rendering; issue 1408 owns it.
- Runtime pipeline replacement; issue 1409 owns it.
- Persistence-plan, physical-schema, and migration replacement; issues 1410 and 1417 own those boundaries.
