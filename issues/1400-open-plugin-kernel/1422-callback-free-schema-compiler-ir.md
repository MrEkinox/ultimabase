# 1422: Define the callback-free schema compiler IR

- Status: completed
- Milestone: 14
- Packages: `@ultimabase/core`
- Depends on: 1421
- ADR: ADR-0187, ADR-0192, ADR-0196

## Goal

Define the immutable public input and output protocol that lets a complete
schema compiler observe every authorized static declaration without receiving
schema classes, executable callbacks, private registries, or infrastructure.

## Acceptance criteria

- [x] Core exports one semantically versioned schema compiler IR input and output contract with English JSDoc and focused examples.
- [x] The input represents developer schemas plus ordered plugin additions, option definitions, selectors, patches, owners, contribution identities, protocol versions, and normalized static options.
- [x] Runtime-bearing schema, field, extension, and option artifacts cross the public boundary only through frozen nominal references owned by one compilation session.
- [x] The public IR recursively contains no function, schema constructor, mutable collection, service, adapter, request state, or infrastructure resource.
- [x] References are deterministic within one compilation, cannot be forged structurally, cannot cross applications, and expose no public resolver.
- [x] The output contract can express one complete logical graph solely from declared artifacts and normalized portable facts; it cannot invent owner or executable identity.
- [x] Malformed values, duplicate identities, stale references, partial graphs, mutable results, and foreign-session references fail through typed deterministic diagnostics.

## Tests

- [x] Runtime tests cover complete snapshots, nested fields, default factories, hooks or Access-bearing fields, plugin fields, additions, every patch family, selectors, options, provenance, immutability, forgery, and application isolation.
- [x] Type and packed-export tests prove the public IR surface without exposing internal schema compilation types or deep imports.

## Out of scope

- Executing the current canonical compiler through the IR; issue 1423 owns it.
- Selecting or executing a replacement compiler; issue 1418 owns it.
- Typegen rendering and dynamic schema handles.
