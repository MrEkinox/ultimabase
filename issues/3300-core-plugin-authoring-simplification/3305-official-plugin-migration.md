# 3305: Migrate official plugins and shrink Plugin Kit

- Status: planned
- Milestone: 33
- Packages: all official plugin packages, `@ultimabase/plugin-kit`
- Depends on: 3304
- ADR: ADR-0269

## Goal

Migrate every official plugin and the open-kernel fixture to the canonical Core
authoring path, then remove foundational wrappers from Plugin Kit.

## Acceptance criteria

- [ ] Every official plugin uses the Core-native factory and capability shape.
- [ ] Password Auth and Soft Delete use canonical operation contributions.
- [ ] Plugin Kit retains only optional higher-level patterns such as events, option parsing, contextual-field helpers, and immutable patch composition.
- [ ] No official plugin imports a foundational registration helper from Plugin Kit.
- [ ] All existing public plugin options and setup exports remain exact.

## Tests

- [ ] Every affected package runtime, type, conformance, and E2E suite passes.

## Handoff

- Documentation impact: pending.
