# 4105: Consolidate captured builder calls

- Status: completed
- Milestone: 41
- Packages: `@ultimabase/core`
- Depends on: 4104

## Goal

Share the private opaque-call identity and snapshot mechanics used by field and
output builder capture without merging their public contracts.

## Acceptance criteria

- [x] Field and output builders retain separate types, contexts, diagnostics,
      nested callbacks, and plugin method resolution.
- [x] One private primitive owns captured-call creation and identity checks.
- [x] Public inference, hover names, Runtime output, and Typegen remain unchanged.
- [x] Production lines decrease and runtime/type tests pass.
- [x] Documentation impact is recorded.

## Outcome

FieldBuilder and OutputBuilder now create opaque delayed calls through one
private registry primitive. Each builder family still owns a distinct registry,
so identity remains nominal and calls cannot cross the Field/Output boundary.
Only creation, immutable snapshot shape, and WeakSet membership are shared;
contexts, callbacks, plugin resolution, diagnostics, and public types stay in
their existing owners.

The duplicated mechanics were removed with 12 fewer handwritten production
lines. A focused registry test protects immutability, forgery rejection, and
cross-family isolation.

## Validation

- `yarn workspace @ultimabase/core typecheck`
- focused runtime suite: 4 files and 27 tests passed
- focused type suite: 2 files and 8 tests passed with no type errors
- focused ESLint passed with only the pre-existing OutputBuilder `max-lines`
  warning
- focused Prettier check and `git diff --check`

## Documentation impact

Internal engineering documentation. The public FieldBuilder and OutputBuilder
contracts, inference, diagnostics, and emitted declarations are unchanged. The
schema examples were reviewed and require no update because declaration and
Runtime behavior did not change.
