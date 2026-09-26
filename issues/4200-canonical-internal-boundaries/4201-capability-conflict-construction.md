# 4201: Centralize capability conflict construction

- Status: completed
- Milestone: 42
- Packages: `@ultimabase/core`
- Depends on: none
- ADR: ADR-0190

## Goal

Make capability inventory and provider planning share one private constructor
for the canonical `PLUGIN_CAPABILITY_CONFLICT` error.

## Acceptance criteria

- [x] The four duplicate error constructors are replaced by one private helper.
- [x] Error codes, messages, internal details, and planning order remain exact.
- [x] No public export or new capability path is added.
- [x] Handwritten production lines decrease and focused parity tests pass.
- [x] Documentation impact is recorded.

## Out of scope

- Changing capability conflict semantics or diagnostics.
- Changing provider ordering, privileges, or Core-owned protocols.
- Sharing unrelated lifecycle failures through the same helper.

## Outcome

Capability inventory, generic provider planning, adapter planning, and
Core-owned capability planning now throw through one private constructor. The
same call sites retain every message and internal detail while handwritten
production code decreases by 24 lines.

## Validation

- `yarn workspace @ultimabase/core typecheck`
- `yarn vitest run --project unit packages/core/src/plugins/capability-composition.test.ts packages/core/src/plugins/capabilities.test.ts packages/core/src/runtime/adapters/capabilities.test.ts`
- `yarn eslint packages/core/src/plugins/capability-conflict.ts packages/core/src/plugins/core-capability-planning.ts packages/core/src/plugins/capability-inventory.ts packages/core/src/plugins/capability-provider-planning.ts packages/core/src/plugins/adapter-capability-planning.ts`
- `git diff --check`

## Documentation impact

Internal engineering documentation. Capability behavior and public APIs are
unchanged, so the public website and package README remain accurate; this issue
records the private consolidation.
