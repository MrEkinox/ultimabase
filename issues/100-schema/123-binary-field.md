# 123: Add native binary fields

- Status: completed
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 102, 109, 115
- ADR: ADR-0027

## Goal

Represent raw bytes without coupling static schemas to database or transport
encodings.

## Acceptance criteria

- [x] `binaryField()` exposes the `binary` kind and `Uint8Array` values.
- [x] Node.js `Buffer` values remain valid native byte inputs.
- [x] Static scalar, list, and structured defaults receive defensive copies.
- [x] Byte-length validation uses non-negative safe-integer `min` and `max`
      boundaries.
- [x] Validation plans preserve binary length constraints.
- [x] Inference carries native byte values through object, create, and update
      shapes.
- [x] PostgreSQL `bytea` and transport encodings remain outside Schema.

## Tests

- [x] Runtime tests cover byte copies, Buffer behavior, lengths, and invalid
      values.
- [x] Type tests cover defaults, lists, inference, and incompatible inputs.
- [x] Structured-default and validation-plan tests cover binary fields.
