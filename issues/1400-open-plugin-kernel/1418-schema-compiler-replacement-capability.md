# 1418: Replace the complete schema compiler through a versioned capability

- Status: completed
- Milestone: 14
- Packages: `@ultimabase/core`
- Depends on: 1423
- ADR: ADR-0187, ADR-0190, ADR-0191, ADR-0192, ADR-0196

## Goal

Expose one exceptional, complete, versioned schema-compiler replacement
protocol without allowing ordinary schema patches to bypass Core ownership,
identity, provenance, or portability invariants.

## Acceptance criteria

- [x] Core defines one public declaration-lifetime schema-compiler capability with a documented protocol version and its current compiler as the canonical provider.
- [x] A plugin requesting `schema:replace` can replace only the complete compatible compiler provider; ordinary `schema:transform` and generic callbacks cannot replace compiler stages or protected identities.
- [x] The replacement receives the immutable callback-free schema compiler IR delivered by issue 1422; the canonical compiler does not run first.
- [x] The replacement returns one immutable logical graph through a validated public contract rather than mutating schema classes, registries, declarations, or another application's graph.
- [x] Core always revalidates application ownership, stable class identity, Core system fields, operation identity, relationship targets, contribution provenance, and the minimum portable schema contract after replacement.
- [x] Version mismatch, missing or stale replacement targets, competing replacements, malformed output, partial replacement, and replacement cycles fail deterministically before plugin setup.
- [x] Replacement provenance identifies the exact plugin and instance, package version, capability protocol version, contribution identity, target provider, and normalized static options.
- [x] Typegen and JavaScript consume the same final replaced logical graph without generated Runtime code or infrastructure during static compilation.

## Tests

- [x] Runtime tests cover successful complete replacement, exact replacement chains, two explicit instances, ordering, malformed output, protected-invariant failures, application isolation, and stable repeat compilation.
- [x] Type and packed tests prove the public capability contract, exact privilege boundary, version compatibility, and absence of private imports or generic callback escape hatches.

## Out of scope

- Ordinary schema additions and patches; issue 1406 owns them.
- Defining the compiler IR and migrating the canonical compiler; issues 1422 and 1423 own those prerequisites.
- Dynamic schema, model, and operation handles; issue 1407 owns them.
- Typegen rendering; issue 1408 owns it.
- Runtime pipeline replacement; issue 1409 owns it.
- Persistence-plan, physical-schema, and migration replacement; issues 1410 and 1417 own those boundaries.
