# ADR-0014: Data naming and system fields

- Status: accepted
- Date: 2026-07-30

## Decision

Use UUID v7, reserved `id`/`createdAt`/`updatedAt`, server-side `Date`, ISO transport serialization, and plural `snake_case` PostgreSQL tables.

Required and nullable are independent. A field cannot be both required and nullable; optional fields remain non-null by default.

Field presence and primitive constraints are grouped under `validation`. Single-field indexing uses `indexed: true` for a regular index, `indexed: "unique"` for a unique index, and `indexed: false` or omission for no index.

## Consequences

Create and update input inference differs from object output inference. Validation metadata has one composable namespace, and index uniqueness cannot contradict a separate boolean option. Table names are predictable while allowing a future explicit override.
