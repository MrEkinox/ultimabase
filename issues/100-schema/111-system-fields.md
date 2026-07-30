# 111: Add reserved system fields

- Status: planned
- Milestone: 1
- Packages: `@ultimabase/schema`
- Depends on: 110
- ADR: ADR-0014

## Goal

Add UUID v7 `id`, `createdAt`, and `updatedAt` metadata to every schema.

## Acceptance criteria

- [ ] Fields appear in object output.
- [ ] Fields are absent from create input and immutable in update input.
- [ ] User declarations cannot shadow them.

## Tests

- [ ] Object/create/update type tests prove the distinction.
