# 2902: Build the interactive selection boundary

- Status: planned
- Milestone: 29
- Packages: future `@ultimabase/create-app`
- Depends on: 2901
- ADR: decision from issue 2901

## Goal

Create the scoped initializer package and one validated selection path shared
by terminal prompts and automation flags.

## Acceptance criteria

- [ ] The package has a deliberate public executable and `--help`; it uses an
      established prompt library for keyboard-driven text, select, multi-select,
      confirmation, cancellation, and progress feedback.
- [ ] Interactive and flag-only invocations normalize to the same immutable
      configuration, with validation for names, destinations, languages,
      package managers, database modes, API choices, and plugin IDs.
- [ ] The grouped selector contains every current official plugin package,
      including infrastructure and explorers. A repository check detects
      omissions when the official catalog changes without importing the private
      website into the publishable CLI package.
- [ ] REST and GraphQL choices update the same plugin selection shown later;
      prerequisite plugins and capability limits are visible before final
      confirmation. Typegen is selected automatically only by TypeScript.
- [ ] Missing non-TTY inputs produce actionable errors. `--yes` accepts only
      documented defaults and never overwrites an existing target. Ctrl-C exits
      cleanly before any project write.

## Tests

- [ ] Vitest covers prompt decisions through a deterministic input adapter,
      equivalent flags, invalid combinations, catalog coverage, non-TTY mode,
      cancellation, and public executable invocation.
- [ ] Run package typecheck, tests, lint, build, constraints, and issue checks.

## Out of scope

- Writing project files, installing dependencies, or publishing the package.
