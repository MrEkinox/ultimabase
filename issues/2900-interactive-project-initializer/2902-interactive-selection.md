# 2902: Build the interactive selection boundary

- Status: completed
- Milestone: 29
- Packages: future `@ultimabase/create-app`
- Depends on: 2901
- ADR: decision from issue 2901

## Goal

Create the scoped initializer package and one validated selection path shared
by terminal prompts and automation flags.

## Acceptance criteria

- [x] The package has a deliberate public executable and `--help`; it uses an
      established prompt library for keyboard-driven text, select, multi-select,
      confirmation, cancellation, and progress feedback.
- [x] Interactive and flag-only invocations normalize to the same immutable
      configuration, with validation for names, destinations, languages,
      package managers, database modes, API choices, and plugin IDs.
- [x] The grouped selector contains every current official plugin package,
      including infrastructure and explorers. A repository check detects
      omissions when the official catalog changes without importing the private
      website into the publishable CLI package.
- [x] REST and GraphQL choices update the same plugin selection shown later;
      prerequisite plugins and capability limits are visible before final
      confirmation. Typegen is selected automatically only by TypeScript.
- [x] Missing non-TTY inputs produce actionable errors. `--yes` accepts only
      documented defaults and never overwrites an existing target. Ctrl-C exits
      cleanly before any project write.

## Tests

- [x] Vitest covers prompt decisions through a deterministic input adapter,
      equivalent flags, invalid combinations, catalog coverage, non-TTY mode,
      cancellation, and public executable invocation.
- [x] Run package typecheck, tests, lint, build, constraints, and issue checks.

## Completion evidence

- `@ultimabase/create-app` exposes a built executable and side-effect-free
  selection API. Clack drives the interactive prompts; flags and prompts meet
  in one immutable validated plan. Selection alone writes no project files.
- The catalog test matches all 16 shipped plugin workspaces and the website
  catalog. The resolver closes HTTP and GraphQL prerequisites, keeps direct
  GraphQL and password identity separate from HTTP, and rejects GraphQL on
  the empty starter because it has no public query field.
- Package Vitest (11 tests), typecheck, ESLint, tsdown with attw/publint,
  `yarn constraints`, and `yarn check:issues` pass. The public executable
  prints its help and validates a `--name notes --yes` preview.
- Documentation impact: internal engineering documentation. The package and
  packages READMEs describe the new selection preview. The public Quick Start
  still correctly labels automatic setup unpublished and unavailable; no
  public behavior is available yet.

## Out of scope

- Writing project files, installing dependencies, or publishing the package.
