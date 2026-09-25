# 3305: Migrate official plugins and shrink Plugin Kit

- Status: completed
- Milestone: 33
- Packages: all official plugin packages, `@ultimabase/plugin-kit`
- Depends on: 3304
- ADR: ADR-0269

## Goal

Migrate every official plugin and the open-kernel fixture to the canonical Core
authoring path, then remove foundational wrappers from Plugin Kit.

## Acceptance criteria

- [x] Every official plugin uses the Core-native factory and capability shape.
- [x] Password Auth and Soft Delete use canonical operation contributions.
- [x] Plugin Kit retains only optional higher-level patterns such as events, option parsing, contextual-field helpers, and immutable patch composition.
- [x] No official plugin imports a foundational registration helper from Plugin Kit.
- [x] All existing public plugin options and setup exports remain exact.

## Tests

- [x] Every affected package runtime, type, conformance, and E2E suite passes.

## Handoff

- Documentation impact: internal engineering documentation. The package and
  open-kernel authoring guides now use Core directly and the Plugin Kit README
  documents its reduced higher-level scope. The public website already taught
  the Core-native module and operation APIs, so no website edit was necessary.
- Schema mutations now use the same owned contribution model as application
  operations. Core derives their declaration, handler provider, optional
  transport bindings, Typegen references, and resource cleanup without changing
  the existing private protocols.
- Validation: root typecheck and build; full repository unit/type suite (540
  files, 2,556 tests); focused Core, Plugin Kit, Password Auth, and Soft Delete
  contribution suites. The first sandboxed full run failed only where local
  listener creation was denied; the permitted rerun passed completely.
