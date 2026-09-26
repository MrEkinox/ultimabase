# 4001: Consolidate native command contribution mechanics

- Status: completed
- Milestone: 40
- Packages: `@ultimabase/core`
- Depends on: none
- ADR: ADR-0259, ADR-0261, ADR-0272

## Goal

Make operation and schema-mutation contributions share their private native
command validation, materialization, and transport-plan mechanics without
merging their public authoring or execution semantics.

## Acceptance criteria

- [x] The four existing public contribution factories and their inference stay
      unchanged.
- [x] One private command implementation owns shared direct/resource handler
      validation, cleanup projection, contribution IDs, and transport plans.
- [x] Operation and schema-mutation errors, ownership, nominal identity,
      lifecycle, and execution semantics remain distinct and unchanged.
- [x] The old cross-module contribution compilation bridge is removed.
- [x] Handwritten production lines decrease and focused parity tests pass.
- [x] Documentation impact is recorded.

## Out of scope

- A public generic command contribution API.
- Combining operation execution with schema-mutation Runtime behavior.
- Changing transport exposure or command graph contracts.

## Outcome

Operations and schema mutations now use one nominal contribution store, one
binding store, one validation path, and one compiler into the existing
`PluginCommandPlan`. The canonical plan itself owns their shared resource
validation, lifecycle projection, contribution IDs, and transport plans.

The former operation compiler no longer imports and delegates to a second
schema-mutation compiler. Public contracts live separately from the private
implementation so all three production files stay below the repository's
400-line warning threshold.

Handwritten production TypeScript contains 649 additions and 708 deletions, a
net reduction of 59 lines. The four public factories, their exported option and
resource types, exact error messages, source inference, direct handlers,
resource-backed handlers, optional cleanup, and binding-only contributions are
unchanged.

## Validation

- Focused command contribution, command graph, operation Runtime, and schema
  mutation suites passed: 6 files and 29 tests, with no type errors.
- The complete Core suite passed: 235 files and 1,085 tests, with no type
  errors.
- `yarn workspace @ultimabase/core typecheck` passed.
- `yarn workspace @ultimabase/core build` passed, including package export
  validation.
- Focused ESLint and `git diff --check` passed.

## Documentation impact

Classification: **internal engineering documentation**.

This issue, the milestone, and `CURRENT_PLAN.md` record the internal ownership
change. Root exports, public configuration, examples, behavior, and diagnostics
are unchanged, so the Core README and public website remain accurate.
