# 324: Prove the native hook contract boundary

- Status: done
- Milestone: 3
- Packages: `@ultimabase/core`
- Depends on: 213, 318, 320, 323
- ADR: ADR-0089, ADR-0090, ADR-0095, ADR-0096

## Goal

Prove how native hooks can be declared with schemas and inline fields inside
the consolidated Core without creating an internal dependency cycle or
weakening TypeScript editor inference.

## Acceptance criteria

- [x] A compile-time prototype supports the target `new Schema({ hooks })` and inline `field({ hooks })` DX, or records a dependency-safe equivalent in a refining ADR before implementation proceeds.
- [x] Schema callbacks infer complete create, update, object, operation, query, and result shapes relevant to their phase.
- [x] Inline field callbacks infer exact scalar, enum, object, list, nullability, and custom-field values without pretending to infer sibling fields.
- [x] Hook callback literals do not enter `FieldDefinition` inference state or expand compact factory hovers.
- [x] The selected ownership keeps Schema independent from Runtime and concrete plugins and preserves the repository dependency direction.
- [x] Public names, package placement, immutable declaration storage, and Runtime resolution are recorded before production code is added.
- [x] The prototype leaves room for policy-neutral deny-only guards, append-only adapter constraints, and narrowing field restrictions without adding CLP or ACL types to Runtime.
- [x] Permission extensions remain opaque plugin configuration and do not enter native schema or field inference.
- [x] Relevant package READMEs and ADR-0089 are refined when the prototype changes a boundary.

## Tests

- [x] Source TypeScript language-service fixtures verify autocomplete and QuickInfo.
- [x] Packed-package fixtures prove the same editor behavior through public declarations.
- [x] Dependency constraints reject any accidental cycle or deep import.

## Out of scope

- Executing hooks through Runtime.
- Creating a package that is not selected by the proven contract.

## Result

The compile-time prototype and ADR-0096 prove the declaration boundary without
shipping a partial production API. Production schema hook storage begins in
issue 325, while field hook storage remains owned by issue 326.
