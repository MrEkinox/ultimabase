# 127: Normalize object defaults by declared fields

- Status: completed
- Milestone: 1
- Packages: schema
- Depends on: 126
- ADR: 0030

## Goal

Use each declared child field as the source of truth when snapshotting static
object defaults.

## Acceptance criteria

- [x] Unknown and missing object-default properties are rejected.
- [x] Every built-in child reuses its scalar or list normalization contract.
- [x] Plugin children reuse the owning field plugin's value normalizer.
- [x] Caller-owned structured, binary, JSON, and plugin values are detached where their contracts require it.
- [x] Tests cover built-in and plugin values nested in object defaults.
