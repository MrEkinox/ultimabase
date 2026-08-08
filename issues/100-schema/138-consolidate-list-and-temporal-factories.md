# 138: Consolidate list and temporal field construction

- Status: done
- Milestone: 1
- Packages: schema
- Depends on: 137
- ADR: ADR-0037

## Goal

Remove the remaining duplicated list interpretation and option-dependent
temporal field construction without changing Schema's public behavior or
inference.

## Acceptance criteria

- [x] List validation and depth calculation share one internal reader.
- [x] Normalized list tuples remain detached and immutable.
- [x] Option-dependent scalar factories reuse one typed construction boundary.
- [x] `timeField` and `dateTimeField` preserve exact empty and declared options.
- [x] No `any`, assertion-hidden boundary, or runtime dependency is introduced.
- [x] Typecheck, tests, lint, build, package validation, and coverage pass.

## Tests

- [x] Existing list runtime and compile-time coverage passes unchanged.
- [x] Temporal fields preserve timezone-specific defaults and ranges.
- [x] Built archives preserve Schema's public API.

## Out of scope

- Changing temporal representations or timezone semantics.
- Changing field default semantics, which is handled by issue 139.
