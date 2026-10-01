# 6319: Align Password User authoring with configured Role schemas

- Status: completed
- Milestone: 63
- Packages: `@ultimabase/password-auth-plugin`, Typegen benchmark consumers
- Depends on: 6314
- ADR: ADR-0284

## Goal

Implement the user-approved `PasswordUserSchema.define(Base.Schema, options)`
form using the existing configured specialization types. Preserve exact User
results in the single Typegen graph and the standalone form, as RoleSchema does.
This is a bounded prerequisite for issue 6313, not another source-only result experiment.

## Acceptance criteria

- [x] Installed plugin builders and local options infer from the supplied namespace without generated declarations; absent plugins and invalid signup inputs produce exact diagnostics.
- [x] Generated User results remain exact for ordinary reads, selection, authentication, and current-user helpers.
- [x] One specialization implementation preserves identity, reserved fields, username constraints, immutable classes, explicit registration, and standalone users.
- [x] Source and built editor checks preserve completion and JSDoc; configured benchmark consumers use the same form as Roles.
- [x] Documentation explains the configured form and the retained standalone Typegen dependency without claiming the whole builder registry is removable.

## Validation and audit gate

- [x] Focused runtime, compile-time, source/built editor, and Password Auth PostgreSQL tests pass.
- [x] Root typecheck and the locked 1/10/50-schema TypeScript benchmark pass.
- [x] `yarn validate:full` passes with coverage totals recorded.
- [x] Audit the full diff, fix findings, repeat affected validation, and record exact line categories plus Documentation impact.
- [x] Create one dedicated local commit, audit its diff, and do not push.

## Baseline

- Revision: `d7a507f6`.
- Existing uncommitted changes: the issue-6313 architecture-stop note and current-plan handoff only.
- The earlier issue-6308 attempt failed on exact User results. This issue retains `PasswordUserDefinition` and its generated result contract; no source result bridge is allowed.
- Standalone `RoleSchema.define(options)`, `PasswordUserSchema.define(options)`, and low-level `Schema.defineSpecialized()` remain consumers to classify in 6313 before removing generated builder contracts.

## Handoff

The configured overload reuses Core's existing configured field and option
types; both forms execute the same specialization compiler. No Core production
code, authentication/session behavior, public top-level export, or production
dependency was added. The only added dependency is the test-only vector plugin.
Explicit registration, reserved fields, immutable unique username, default
User isolation, and exact generated results remain intact.

This issue improves configured authoring, not net Typegen code size. It removes
the generation prerequisite for that form's plugin builders and local options,
but does not remove generated User results or the standalone forms' builder and
option contracts. Issue 6313 must classify those remaining consumers before
deletion; issue 6316 now explicitly includes them in its final audit.

Documentation impact: both. The package README and public authentication guide
show the configured form and the acyclic multi-file order; ADR-0284 and the
milestone plan record the accepted boundary. No implementation exceeds the
issue's acceptance criteria.

## Audit iterations

| Iteration | Finding and correction                                                                                                                                                                                                                                                                                  | Evidence                                                                                                                                                                                                                                              | Remaining findings              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1         | The public overload requires an explicit username-field return type under `isolatedDeclarations`; its state now preserves required and immutable flags. Keep the generated result reference rather than retrying the rejected source-result bridge.                                                     | Root typecheck, 15 Password Auth files/68 tests, and 8 built integration files/32 tests pass. Source and built editor checks prove generated read/selection/authentication/current results and source-only builders, options, and signup diagnostics. | Full gate pending.              |
| 2         | The first full run passed 557 files/2,652 tests, including locked 1/10/50-schema budgets, then lint rejected the intentional call to an absent builder. The negative type test now checks property absence without making an unsafe call. No lint suppression, threshold, or product change was needed. | Focused lint passes; 2 type-test files/11 tests pass. Full validation restarted with local-network/PostgreSQL permissions.                                                                                                                            | Await final full-gate evidence. |

## Final validation and line audit

Final audit iteration 3: the complete diff, new files, unchanged specialization
compiler, retained standalone path, fixture assertions, benchmark thresholds,
dependency direction, and documentation were reviewed. The corrected full
`yarn validate:full` passes with zero remaining findings: 557 ordinary files /
2,652 tests, 636 coverage files / 2,914 tests, 1 metadata file / 9 tests, and
17 website files / 66 tests. Formatting, root typecheck, lint, all package
build/export checks, and dependency constraints pass. Existing file-size lint
warnings are unchanged. Source/built editor checks and the 8-file / 32-test
built Password Auth suite also pass.

Coverage compared with the recorded 6314 baseline:

| Metric     | Before                   | After                    |
| ---------- | ------------------------ | ------------------------ |
| Statements | 23,797 / 26,155 (90.98%) | 23,800 / 26,158 (90.98%) |
| Branches   | 14,692 / 17,385 (84.50%) | 14,698 / 17,391 (84.51%) |
| Functions  | 5,003 / 5,206 (96.10%)   | 5,003 / 5,206 (96.10%)   |
| Lines      | 23,072 / 25,200 (91.55%) | 23,075 / 25,203 (91.55%) |

No threshold, exclusion, or required check was removed. The locked
1/10/50-schema compiler/editor budgets pass in both ordinary runs and coverage.
They remain synthetic hybrid/current comparisons, not a claim that production
Typegen has already shrunk.

Final line counts against `d7a507f6`: 18 files, +454/-39 (net +415).
Categories: production +57/-3; tests/fixtures +149/-19; documentation/plans +246/-17; dependency metadata +2/-0.
Production is +57/-3 (net +54), entirely in `user-schema.ts`. No Core or Typegen
production code changed. The dedicated commit is local only; no push is authorized.
