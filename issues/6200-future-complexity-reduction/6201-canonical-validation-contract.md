# 6201: Establish one validation contract

- Status: completed
- Milestone: 62
- Packages: repository tooling
- Depends on: none
- ADR: ADR-0275

## Goal

Give developers, coding agents, and GitHub one named definition of ordinary and
complete repository validity, including formatting.

## Acceptance criteria

- [x] One root command runs the ordinary formatting, type, test, lint, and build gates.
- [x] One root command extends that contract with complete coverage and repository documentation guards.
- [x] Full GitHub validation checks the same repository-wide formatting command.
- [x] A regression test prevents full CI from silently checking no files.
- [x] Contributor and agent instructions name the canonical commands.
- [x] No existing selected-CI optimization, test, project, report, threshold, or worker bound changes.
- [x] Documentation impact is recorded.

## Tests

- [x] Focused CI command-routing regression.
- [x] Complete debt-refactor validation gate.

## Out of scope

- Replacing affected GitHub validation.
- Adding a task-graph dependency.
- Changing Vitest discovery or coverage membership.

## Documentation impact

Internal engineering documentation. `AGENTS.md`, `CONTRIBUTING.md`, the test and
CI tooling guides, the milestone plan, and ADR-0275 now name one ordinary and
one complete validation contract. No public package behavior, export,
configuration, installation, error, security semantic, or supported integration
changed, so the public website remains accurate.

## Outcome

`yarn validate` composes the existing formatting, typecheck, ordinary test,
lint, and build commands. `yarn validate:full` extends it with unchanged complete
coverage, issue metadata, dependency constraints, and website documentation
validation. Full GitHub selection now invokes `yarn format:check` even when a
manual run has no changed-file list; affected selection retains its existing
changed-file formatting optimization.

No test project, coverage input, report, threshold, package selection rule,
browser installation, PostgreSQL setup, or local/hosted worker bound changed.

## Validation

- focused CI and issue metadata: 4 files, 54 tests
- `yarn validate:full`
  - format: all matched files
  - ordinary tests: 546 files, 2,590 tests, no type errors
  - lint: 0 errors; existing line-budget warnings only
  - build: every package passed build, API checks, and package linting
  - complete coverage: 621 files, 2,837 tests, no type errors
  - coverage: 90.91% statements (23,677/26,042), 84.44% branches
    (14,693/17,399), 96.07% functions (4,987/5,191), 91.47% lines
    (22,964/25,103)
  - issue metadata: 1 file, 9 tests
  - public documentation validation: 17 files, 66 tests
