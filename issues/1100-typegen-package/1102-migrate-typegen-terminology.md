# 1102: Migrate Typegen terminology and repository documentation

- Status: completed
- Milestone: 11
- Packages: repository documentation and examples
- Depends on: 1101
- ADR: [ADR-0184](../../docs/adr/0184-typegen-package-identity.md)

## Goal

Make every current developer-facing surface describe Typegen precisely while
preserving historical records that document the former package identity.

## Acceptance criteria

- [x] Root, architecture, package, Core, Typegen, and example documentation use `typegen` terminology.
- [x] Current code comments, diagnostics, fixture names, and test descriptions no longer call this package generic Codegen.
- [x] Test and fixture filenames use Typegen where the file specifically validates this package.
- [x] Future CLI documentation describes Typegen commands rather than a generic codegen command.
- [x] Historical accepted ADRs, completed issues, and archived plans retain truthful former names where appropriate.
- [x] A focused repository audit distinguishes allowed historical references from stale live references.

## Tests

- [x] Documentation links and package paths resolve after the directory rename.
- [x] Formatting and repository lint pass.
- [x] No live application or current guide imports `@ultimabase/codegen`.

## Out of scope

- Rewriting historical decisions to hide the former name.
- Renaming generic internal generator concepts that already describe their exact responsibility.
- Adding new generated artifacts.

## Validation evidence

- Changed Markdown links resolve, including the historical ADR links redirected
  to `packages/typegen` and the renamed packed E2E test.
- Repository lint passes, and focused packed-package validation passes with 5
  files and 50 tests.
- The live-surface audit finds no former package path, plugin factory, or public
  Typegen contract name. Remaining former-name references are limited to the
  rename decision itself, truthful historical ADR wording, completed issues,
  and archived plans.
