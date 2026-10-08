# ADR-0287: GraphQL Tools owns standard type rewiring

- Status: accepted
- Date: 2026-10-02
- Refines: ADR-0238
- Approval: user approved bounded behavior-preserving package replacements
- Decision issue: 6502 (archived at tag `reference-archive`: `issues/6500-standard-package-simplification/6502-graphql-tools-composition.md`)

## Decision

The GraphQL plugin directly depends on `@graphql-tools/utils` and uses its public
`rewireTypes()` to clone and connect the completed type graph. Remove the manual
recursive type cache, input/argument/directive rewiring and unused source index.
The library version supports GraphQL 17 and does not raise the Node 24.0 floor.

UltimaBase keeps deterministic contribution order, strict conflict preflight,
identity-based root normalization, first-source metadata and exact callback
ownership. GraphQL remains optional and Core knows nothing about this dependency.
Developer configuration, public exports, Runtime execution and safe errors do
not change. The final schema remains detached from contributed schema topology.

## Alternatives and proof

Do not use permissive `mergeSchemas()` or SDL round-tripping: resolver overwrites,
differently named roots and scalar-default replay violate the existing contract.
Rewiring accepts a preflighted map, not an unrestricted extension mechanism.

Five characterization tests pass against both the original composer and the
replacement: root aliases with colliding original names, cyclic/wrapped object
and input references, enums/directives, abstract callback ownership and both
legacy/internal and GraphQL 17 external scalar defaults. Existing security and
compiled-package checks remain required; the issue records full validation.

The shared Vitest dependency rule must match resolved `@graphql-tools` paths,
not only bare package identifiers, to avoid loading a second GraphQL realm.
