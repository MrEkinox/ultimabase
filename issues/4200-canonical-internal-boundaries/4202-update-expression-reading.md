# 4202: Centralize normalized update-expression reading

- Status: in progress
- Milestone: 42
- Packages: `@ultimabase/core`
- Depends on: 4201
- ADR: ADR-0153

## Goal

Make immutable update application and Runtime field traversal share one private
structural reader for normalized update-expression operations.

## Acceptance criteria

- [ ] One private reader validates the canonical update-expression shape.
- [ ] Each caller retains its exact contextual error message and operation rules.
- [ ] Update semantics, Runtime traversal, and public types remain unchanged.
- [ ] Handwritten production lines decrease and focused parity tests pass.
- [ ] Documentation impact is recorded.

## Out of scope

- Changing update normalization or accepted operations.
- Moving Runtime traversal into Query.
- Exposing a new public update-expression API.
