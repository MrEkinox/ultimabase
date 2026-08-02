# 324: Prove the native hook contract boundary

- Status: ready
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 213, 318, 320, 323
- ADR: ADR-0089, ADR-0090, ADR-0095

## Goal

Prove how native hooks can be declared with schemas and inline fields inside
the consolidated Core without creating an internal dependency cycle or
weakening TypeScript editor inference.

## Acceptance criteria

- [ ] A compile-time prototype supports the target `new Schema({ hooks })` and inline `field({ hooks })` DX, or records a dependency-safe equivalent in a refining ADR before implementation proceeds.
- [ ] Schema callbacks infer complete create, update, object, operation, query, and result shapes relevant to their phase.
- [ ] Inline field callbacks infer exact scalar, enum, object, list, nullability, and custom-field values without pretending to infer sibling fields.
- [ ] Hook callback literals do not enter `FieldDefinition` inference state or expand compact factory hovers.
- [ ] The selected ownership keeps Schema independent from Runtime and concrete plugins and preserves the repository dependency direction.
- [ ] Public names, package placement, immutable declaration storage, and Runtime resolution are recorded before production code is added.
- [ ] The prototype leaves room for policy-neutral deny-only guards, append-only adapter constraints, and narrowing field restrictions without adding CLP or ACL types to Runtime.
- [ ] Permission extensions remain opaque plugin configuration and do not enter native schema or field inference.
- [ ] Relevant package READMEs and ADR-0089 are refined when the prototype changes a boundary.

## Tests

- [ ] Source TypeScript language-service fixtures verify autocomplete and QuickInfo.
- [ ] Packed-package fixtures prove the same editor behavior through public declarations.
- [ ] Dependency constraints reject any accidental cycle or deep import.

## Out of scope

- Executing hooks through Runtime.
- Creating a package that is not selected by the proven contract.
