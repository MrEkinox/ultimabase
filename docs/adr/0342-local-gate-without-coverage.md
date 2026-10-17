# ADR-0342: Validate locally without coverage, once

- Status: accepted
- Date: 2026-10-17
- Refines: ADR-0291 (validation cadence)
- Approval: proposed after measuring the gate and approved by the user on 2026-10-17

## Context

Before a merge into `main`, the local gate ran `yarn validate:full` and then `yarn test:e2e:built`. Measured on a calm
machine on 2026-10-17 (`main` with ADR-0341 merged):

| Step                                                         | Time    |
| ------------------------------------------------------------ | ------- |
| format, typecheck, lint, build, performance budgets          | 277 s   |
| `test:coverage`: unit, types, E2E and PostgreSQL E2E sources | 570 s   |
| constraints and public documentation                         | 63 s    |
| `test:e2e:built`: E2E against the built packages             | ~260 s  |
| Total                                                        | ~19 min |

The E2E suites ran twice: instrumented from sources for coverage, then against the built packages. One uninstrumented
run of unit, types, E2E, PostgreSQL E2E and isolated E2E against the built packages took 394 s and passed the same
suites (782 files, 4,265 tests). GitHub CI already runs complete coverage on every push to `main` and every pull request,
so the local coverage run duplicated it.

## Decision

- `yarn validate:full` runs format, typecheck, lint, build, performance budgets, then one uninstrumented run of the
  unit, types, E2E, PostgreSQL E2E and isolated E2E projects against the built packages, then dependency constraints
  and public documentation. It replaces `yarn validate:full` followed by `yarn test:e2e:built`.
- `yarn test:coverage` remains available and stays a GitHub CI check. Coverage is no longer part of the local gate.
- Cadence is otherwise unchanged: focused tests and `yarn validate:affected` before intermediate commits,
  `yarn validate:full` before every merge into `main`, GitHub CI as the final check.

## Consequences

- The local gate takes about 12 minutes instead of about 19, and runs each suite once.
- E2E suites are checked against the built packages, as users receive them, and no longer against instrumented sources
  locally.
- A drop in coverage is found by GitHub CI after a push instead of before the merge; it is fixed at once.
- `yarn website:test`, `yarn typecheck:typescript-7` and `yarn install --immutable` stay separate checks, as before.
- **Documentation impact:** internal engineering documentation (this record, `CLAUDE.md`, `CONTRIBUTING.md` where
  they describe the gate).
