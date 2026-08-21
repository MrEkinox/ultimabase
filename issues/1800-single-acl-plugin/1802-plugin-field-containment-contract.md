# 1802: Expose typed containment for JSON-backed plugin fields

- Status: completed
- Milestone: 18
- Packages: `@ultimabase/core`, `@ultimabase/typegen`
- Depends on: 1801
- ADR: decision from issue 1801

## Goal

Implement the accepted field-owned `contains` capability through Core's public
plugin-field and Query contracts with exact editor inference and immutable
Runtime validation.

## Acceptance criteria

- [x] `definePluginField` exposes only the accepted `structuralContains` opt-in and rejects containment without a portable JSON storage codec or on a list field.
- [x] The field owner supplies a pure synchronous operand snapshot; Core independently validates, detaches, and freezes its portable JSON fragment.
- [x] Query authoring exposes the exact declared operand type and reuses the existing `contains` AST leaf rather than adding a plugin leaf or registry.
- [x] Protected policies can append the same validated leaf through `rowFilter` without an ACL-specific or adapter-specific escape hatch.
- [x] Core publishes and preflights the exact versioned database-adapter support marker before any adapter effect.
- [x] Capability metadata and its owner-scoped operand type survive schema compilation, application isolation, Typegen, and packed declarations without exposing executable callbacks in inert artifacts.
- [x] Existing JSON/object containment and complete-value plugin equality remain unchanged.
- [x] Core schema examples and package documentation show one community plugin field using the capability.

## Tests

- [x] Runtime tests cover malformed declarations, immutable operands, application isolation, unsupported operators, and JavaScript boundary failures.
- [x] Compile-time and language-service tests protect exact source, generated, and packed Query inference.
- [x] Public export and dependency tests prove Core imports no concrete plugin or adapter.

## Out of scope

- PostgreSQL compilation, owned by issue 1803.
- ACL migration or package deletion.
- General custom operators or adapter callbacks in field declarations.
