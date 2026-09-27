# 6103: Reuse compatible editor workspaces

- Status: completed
- Milestone: 61
- Packages: repository tooling, `@ultimabase/core`, `@ultimabase/typegen`, public source-declaration tests
- Depends on: 6102
- ADR: none

## Goal

Reduce the remaining TypeScript editor-test critical path by sharing one real
language-service project across compatible virtual files, without merging
assertions or weakening source, built-package, hover, completion, or diagnostic
contracts.

## Acceptance criteria

- [x] Shared test tooling supports versioned multi-file editor workspaces.
- [x] Core FieldBuilder fixtures reuse one project without changing their
      completion, documentation, hover, literal, or diagnostic assertions.
- [x] Typegen application fixtures reuse their common generated registry and
      one project while retaining independent semantic contracts.
- [x] Compatible public source-declaration fixtures reuse one project per
      package; source and built-package resolution remain separate.
- [x] Test names, assertion membership, project discovery, and complete
      coverage remain unchanged.
- [x] Repeated focused and complete profiles report the measured gain and
      variance without extrapolating cumulative worker time to wall time.
- [x] Every standard repository validation gate passes.

## Out of scope

- Sharing projects across incompatible module augmentations.
- Combining source and packed-package resolution.
- Replacing TypeScript's language service, diagnostics, or editor APIs.
- Removing tests, reports, projects, thresholds, or production coverage.
- Changing Typegen output or any public package contract.

## Documentation impact

Internal engineering documentation. The milestone, issue, and current plan now
record the compatible-workspace boundary and measured results. No production
behavior, public API, configuration, error, installation flow, or website
contract changed.

## Outcome

The shared editor-test tooling now owns a versioned multi-file TypeScript
workspace. Compatible virtual sources reuse one real language service and its
module-resolution cache, while file and project versions preserve TypeScript's
normal incremental invalidation. The existing single-file helper delegates to
the same implementation.

Core field completion and hover fixtures, Typegen's generated-application
contracts, Access and Hooks core-only checks, and ten source public-API suites
now share workspaces only where compiler options and ambient declarations are
identical. Incompatible module augmentations and source-versus-packed package
resolution remain isolated. A focused public-API fixture also centralizes the
previously duplicated export, removed-symbol, and documentation plumbing.

The identical 38-file editor profile retained all 223 tests. Wall time fell
from 19.82 seconds to 17.69, 17.69, and 17.74 seconds in repeated post-change
runs: a stable 2.08 to 2.13-second or 10.5% to 10.8% reduction. Cumulative file
time fell from 147.81 seconds to 118.38-120.62 seconds, an 18.4% to 19.9%
reduction; this worker-total metric is deliberately reported separately from
wall time.

Two complete coverage runs finished in 235.97 and 218.51 seconds, versus 246.45
and 251.58 seconds after issue 6102. The ranges do not overlap: the minimum
observed improvement is 10.48 seconds or 4.3%, while the two-run averages fell
from 249.02 to 227.24 seconds, a 21.78-second or 8.7% reduction. Against
milestone 61's original 433.38-second two-worker baseline, complete coverage is
now 45.5% to 49.6% faster.

## Validation

- focused editor profile: 38 files and 223 tests; three final runs in 17.69,
  17.69, and 17.74 seconds
- `yarn typecheck`
- `yarn test`: 546 files, 2,589 tests, no type errors
- `yarn lint`: 0 errors; 77 existing file-budget warnings
- `yarn build`: every package passed build, API checks, and package linting
- `yarn test:coverage`: 621 files, 2,836 tests, no type errors; two final runs
  in 235.97 and 218.51 seconds
- coverage: 90.91% statements (23,677/26,042), 84.44% branches
  (14,693/17,399), 96.07% functions (4,987/5,191), and 91.47% lines
  (22,964/25,103), unchanged from the baseline
