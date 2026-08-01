# 111: Add reserved system fields

- Status: done
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 110
- ADR: ADR-0014

## Goal

Add UUID v7 `id`, `createdAt`, and `updatedAt` metadata to every schema.

## Acceptance criteria

- [x] Fields appear in object output.
- [x] Fields expose generated and immutable metadata for create/update inference.
- [x] User declarations cannot shadow them.

## Tests

- [x] Object/create/update metadata type tests prove the distinction.
