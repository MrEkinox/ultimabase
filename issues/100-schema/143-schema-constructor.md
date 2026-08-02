# 143: Replace defineSchema with the Schema class

- Status: done
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 110, 126, 130
- ADR: ADR-0093

## Goal

Align static schema declarations with UltimaBase's immutable class-based public
API without weakening literal inference or runtime declaration validation.

## Acceptance criteria

- [x] `new Schema(options)` preserves class names, fields, indexes, extensions,
      operation inputs, and persisted-object inference.
- [x] Schema instances copy caller-owned containers and are frozen.
- [x] Runtime schema boundaries reject objects that bypassed the constructor.
- [x] `SchemaDefinition` remains available as the neutral structural contract.
- [x] `defineSchema` is removed from runtime and declaration exports.
- [x] Repository code and current documentation use the constructor syntax.
- [x] Constructor options and nested indexes retain autocomplete and hover help.

## Tests

- [x] Runtime tests cover class identity, immutable snapshots, and malformed
      JavaScript input.
- [x] Compile-time tests cover literal inference, reserved fields, and the
      required `new` operator.
- [x] TypeScript language-service tests cover constructor and option help.
- [x] Public package export and packed-package checks cover the new API.
