# 4105: Consolidate captured builder calls

- Status: planned
- Milestone: 41
- Packages: `@ultimabase/core`
- Depends on: 4104

## Goal

Share the private opaque-call identity and snapshot mechanics used by field and
output builder capture without merging their public contracts.

## Acceptance criteria

- [ ] Field and output builders retain separate types, contexts, diagnostics,
      nested callbacks, and plugin method resolution.
- [ ] One private primitive owns captured-call creation and identity checks.
- [ ] Public inference, hover names, Runtime output, and Typegen remain unchanged.
- [ ] Production lines decrease and runtime/type tests pass.
- [ ] Documentation impact is recorded.
