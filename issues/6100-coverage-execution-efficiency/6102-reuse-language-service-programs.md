# 6102: Reuse language-service programs

- Status: completed
- Milestone: 61
- Packages: repository tooling, `@ultimabase/core`, `@ultimabase/access-plugin`, `@ultimabase/hooks-plugin`
- Depends on: 6101
- ADR: none

## Goal

Reduce repeated TypeScript program construction in editor-contract tests while
preserving every completion, hover, diagnostic, source-export, and compiled-
declaration assertion.

## Acceptance criteria

- [x] Core compact field-signature cases share one language-service program.
- [x] Access and Hooks completion requests reuse one service whenever they read
      different markers from the same source.
- [x] Source and compiled-package contracts remain separate where their module
      resolution is intentionally different.
- [x] Test names and assertion coverage remain independently actionable.
- [x] Before/after profiles demonstrate a material local time reduction.
- [x] Complete coverage membership, counters, thresholds, and standard
      repository validation remain intact.

## Out of scope

- Removing or merging distinct editor contracts.
- Sharing a mutable language service across incompatible module augmentations.
- Replacing TypeScript's real language service with mocked types or snapshots.
- Reorganizing PostgreSQL, Create App, performance, or CI integration suites.

## Documentation impact

Internal engineering documentation. The tooling README now records when editor
markers may share a language-service program. No product API, configuration,
runtime behavior, or public website contract changed.

## Outcome

The shared TypeScript test tooling now creates one language-service fixture for
multiple unique markers in a compatible virtual source. It replaces markers
with equal-width whitespace, preserving every editor position while preventing
the fixture comments from changing completion and QuickInfo context.

Core's 14 compact field-signature cases now share one program while retaining
their 14 independent test cases and exact hover assertions. Access and Hooks
reuse a service for completion requests against the same source, and Access
also reuses that program for diagnostics when the source is identical. Distinct
module augmentations and source-versus-built contracts remain isolated.

The focused three-file profile retained all 145 tests while falling from 9.97
seconds to 3.53 seconds of wall time, a 6.44-second or 64.6% reduction. Its
cumulative test time fell from 14.72 seconds to 6.62 seconds, an 8.10-second or
55.0% reduction.

Complete local coverage retained all 621 files and 2,836 tests. Two post-change
runs completed in 246.45 and 251.58 seconds, compared with 256.34 seconds after
issue 6101. The measured wall-time reduction is therefore 4.76 to 9.89 seconds,
or 1.9% to 3.9%; this modest range is reported separately from the larger,
stable focused-suite gain. Against milestone 61's original two-worker baseline
of 433.38 seconds, complete coverage is 42.0% to 43.1% faster.

## Validation

- focused editor profile: 3 files and 145 tests in 3.53 seconds; 6.62 seconds
  cumulative test time
- `yarn typecheck`
- `yarn test`: 546 files, 2,589 tests, no type errors
- `yarn lint`: 0 errors; 76 pre-existing file-budget warnings
- `yarn build`: every package passed build, API checks, and package linting
- `yarn test:coverage`: 621 files, 2,836 tests, no type errors; two final runs
  in 246.45 and 251.58 seconds
- coverage: 90.91% statements (23,677/26,042), 84.44% branches
  (14,693/17,399), 96.07% functions (4,987/5,191), and 91.47% lines
  (22,964/25,103), unchanged from the baseline
