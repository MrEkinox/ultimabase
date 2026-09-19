# ADR-0251: Affected GitHub validation

- Status: accepted
- Date: 2026-09-19
- Extends: ADR-0250

## Decision

GitHub Actions selects checks from the complete pull-request diff or the complete
push diff on `main`. Branch pushes do not duplicate pull-request runs. Manual
dispatch requests full validation. Local commands retain their complete suite
selection; release validation is unchanged.

The `dorny/paths-filter` action provides changed paths, including both sides of
renames. The planner uses `yarn workspaces list --since=<base> --recursive --json`
to select changed packages and their transitive dependants from Yarn's workspace
graph. Workspace inventory and selection need no dependency installation. Yarn's
documentation exclusions are scoped to the CI subprocess environment. Test-only
consumers additionally select their individual suites through package references
and recursively followed relative fixture paths. These consumers do not expand
the production dependency graph. Quoted subprocess paths and generated source
imports are included. Archive enumeration and generated-application E2E have
explicit conservative dependencies on every package.

Documentation changes run formatting and documentation checks without package
tests, builds, browser installation, or PostgreSQL. Website implementation
changes run website checks. Shared configuration, lockfiles, manifests, shared
fixtures, removed test files, unknown paths, or unavailable diff history request
full validation. New computed fixture dependencies must be represented explicitly
in the selector and protected by a regression test.

One build job checks production references and compiles public packages. A tar
artifact preserves paths and executable permissions for parallel package and
transversal jobs. Each package checks its test compiler program and lint scope;
Vitest receives explicit projects and selected files. PostgreSQL starts only for
selected PostgreSQL suites; browsers install only for selected browser suites.
The final `Quality` check retains the existing required-check name and rejects
failed or cancelled dependencies while accepting intentionally skipped jobs.

## Coverage

All existing tests, coverage inclusions, exclusions, and thresholds are retained.
Full validation runs the existing complete coverage command and compiled-export
E2E. Package jobs omit unit, type, and performance execution already covered by
that complete coverage run. The repository job likewise avoids duplicate tooling
tests.

Ordinary affected runs do not execute the full coverage command: doing so would
run every test again and defeat selection. They therefore do not enforce the
global coverage percentage. Partial results are never presented as a complete
coverage report or compared with the global denominator. Use the manual complete
workflow when a complete coverage report is required. This is a scheduling change,
not evidence that future partial runs cannot reduce coverage.

## Consequences

Changes near Core can correctly affect almost the whole graph. A leaf package
change also selects integration consumers and generated-app checks, but does not
automatically select unrelated tests from their host packages. Shared-input
fallbacks favor correctness over speed. The workflow summary exposes the selected
packages and transversal count. Planner, Git boundary, command-routing, and real
Vitest inventory tests protect against silently omitted suites.

The standard GitHub actions own checkout, path detection, Node setup, dependency
archive caching, and build artifact transfer. Custom scripts only adapt their
outputs to this repository's suite ownership and execute the resulting checks;
they do not implement another workspace dependency graph.

The first hosted execution is needed to measure actual wall time and cache
behavior. No fixed speedup is claimed from local verification.
