# 3801: Consolidate Password Auth option boundaries

- Status: completed
- Milestone: 38
- Depends on: none

## Goal

Use Plugin Kit's strict immutable parser for Password Auth's root, password,
and session option objects instead of maintaining three local plain-object,
allowed-key, and unknown-key loops.

## Acceptance criteria

- [x] Root, password, and session options share the canonical Plugin Kit
      boundary while preserving their existing diagnostics.
- [x] Password security floors, policy versions, session bounds, cookie rules,
      custom User validation, defaults, and peer selection remain unchanged.
- [x] Successful normalized policies remain immutable and public generic
      inference remains unchanged.
- [x] Focused runtime/type tests and the complete package suite pass.
- [x] The production delta is negative and documentation impact is recorded.

## Result

Password Auth's root, password-policy, and session-policy inputs now enter
Plugin Kit's one strict immutable option boundary. The package no longer owns
three copies of plain-object detection, key sets, and unknown-key loops. Its two
numeric policies also share one internal bounded-integer resolver instead of
duplicating the same range algorithm.

Only omitted (`undefined`) option arguments receive an empty object; `null`
continues to fail. Existing string-key diagnostics, password security floors,
policy versions, session bounds, cookie rules, custom User validation, defaults,
and conditional HTTP peer selection are unchanged. Undeclared symbol keys are
now rejected by the canonical strict boundary instead of being silently
ignored; symbols were never supported option capabilities.

Production changed by 105 additions and 133 deletions (`-28` lines). The new
internal helper adds one small file, while public exports and declaration output
remain unchanged. Tests required no replacement or deletion.

## Validation

- focused root, password, session, and HTTP option suite (4 files, 23 tests)
- `yarn workspace @ultimabase/password-auth-plugin test` (15 files, 64 tests)
- `yarn workspace @ultimabase/password-auth-plugin typecheck`
- `yarn workspace @ultimabase/password-auth-plugin build`
- `yarn typecheck`
- `yarn lint` (no errors; 81 existing line-budget warnings)
- `yarn check:issues`
- `yarn measure:simplification`

## Documentation impact

**Internal engineering documentation.** The accepted option names, values,
defaults, examples, security semantics, public types, and errors remain
accurate. This issue records the implementation consolidation; no package or
website contract needs revision.
