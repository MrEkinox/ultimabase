# Affected GitHub CI handoff

User-requested GitHub Actions optimization, 2026-09-19, following the package
test ownership passes and ADR-0251.

## Delivered scope

- Standard `dorny/paths-filter` action detects changed paths. The existing pinned
  Yarn selects affected workspaces and transitive dependants through
  `workspaces list --since=<base> --recursive --json`. There is no custom
  workspace dependency graph, new task runner, or additional npm dependency.
- Repository-specific rules select integration consumers through imports,
  generated source strings, quoted subprocess fixtures, and relative helper
  chains. Test-only consumers do not propagate into unrelated host-package tests.
- Documentation changes run formatting and documentation checks. Package changes
  schedule package checks and the relevant root integrations. Shared/unknown
  inputs, deleted tests, missing history, failed change detection, and manual
  dispatch request complete validation.
- Public packages build once and their compiled artifacts are shared with the
  package matrix and transversal checks. Six package jobs can run concurrently.
  Selected suites determine PostgreSQL and browser requirements.
- Push checks run on `main`; PR checks cover feature branches without duplicate
  branch-push runs. The final required check retains the name `Quality` and fails
  if a scheduled job fails or is cancelled.
- Local Yarn commands and the release workflow remain unchanged. No test is
  removed, moved, disabled, or weakened. Production source and coverage settings
  remain unchanged.

Full validation retains the complete coverage command with existing thresholds.
Ordinary affected runs intentionally do not execute or enforce global coverage,
because that would rerun the entire suite. They do not publish partial coverage
as a global result. Manual workflow dispatch remains available for the complete
gate. The earlier ownership-pass percentage comparison is not a new measurement
of this CI change.

All implementation stays within the requested CI optimization; public behavior
and package contracts are unchanged.

## Validation

- CI guards: 43 tests across three files pass. They exercise the actual pinned
  Yarn against temporary Git repositories, direct/transitive dependants, mixed
  code/documentation changes, invalid inputs, removed tests, fixture chains,
  command failures, and selected command routing.
- Broader CI/documentation/issue/discovery guards: 63 tests across six files pass.
  The full selection equals Vitest's actual package/root suite inventory exactly
  once, excluding duplicate coverage projects.
- The actual GraphiQL package runner passes its test compiler program, lint,
  compile-time suite, and four runtime/E2E files containing 17 tests. No Core
  runtime suite is launched.
- The actual documentation runner passes formatting, five active-contract tests,
  and all 66 website content checks without a package runtime suite.
- The actual transversal runner passes root test typechecking, scoped lint, and
  the selected official-plugin-manifest E2E (one file / one test).
- Root `yarn typecheck`, CI/config lint, `yarn constraints`, production-reference
  checking, and `yarn build` pass. The build's package declaration and publication
  audits pass. Changed-file formatting, actionlint, and `git diff --check` pass.

The complete product runtime suite and global coverage were not rerun: production
code, product tests, and coverage configuration are unchanged. Hosted job
conditions, cache restoration, artifact exchange, runner resource limits, and
elapsed time still require the first GitHub execution. No remote run, push, or
publication was performed.

## Documentation impact: internal engineering documentation

ADR-0251 and the CI/testing guides describe selection, fallback behavior, coverage
scope, and unchanged local commands. Public website documentation needs no edit:
there is no change to public behavior, exports, installation, application
configuration, supported integrations, or linked product evidence.
