# 1102: Migrate Typegen terminology and repository documentation

- Status: planned
- Milestone: 11
- Packages: repository documentation and examples
- Depends on: 1101
- ADR: [ADR-0184](../../docs/adr/0184-typegen-package-identity.md)

## Goal

Make every current developer-facing surface describe Typegen precisely while
preserving historical records that document the former package identity.

## Acceptance criteria

- [ ] Root, architecture, package, Core, Typegen, and example documentation use `typegen` terminology.
- [ ] Current code comments, diagnostics, fixture names, and test descriptions no longer call this package generic Codegen.
- [ ] Test and fixture filenames use Typegen where the file specifically validates this package.
- [ ] Future CLI documentation describes Typegen commands rather than a generic codegen command.
- [ ] Historical accepted ADRs, completed issues, and archived plans retain truthful former names where appropriate.
- [ ] A focused repository audit distinguishes allowed historical references from stale live references.

## Tests

- [ ] Documentation links and package paths resolve after the directory rename.
- [ ] Formatting and repository lint pass.
- [ ] No live application or current guide imports `@ultimabase/codegen`.

## Out of scope

- Rewriting historical decisions to hide the former name.
- Renaming generic internal generator concepts that already describe their exact responsibility.
- Adding new generated artifacts.
