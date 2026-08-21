# 1612: Normalize backlog status and milestone metadata

- Status: completed
- Milestone: 16
- Packages: repository issue backlog
- Depends on: 1509
- ADR: none

## Goal

Make issue and milestone metadata follow one documented vocabulary so repository
tooling can classify completed, merged, superseded, ready, and planned work
without special cases.

## Acceptance criteria

- [x] `issues/README.md` documents every status retained by issue files, including the chosen representation for completed and merged historical issues.
- [x] Existing issue front matter uses the documented canonical status values or carries an explicitly documented historical exception.
- [x] Milestone READMEs use the same completion vocabulary as their child issues.
- [x] Merged issues retain their history and target issue without masquerading as independently implemented work.
- [x] Issue 1509 and milestone 15 reference every decisive ADR, including ADR-0202, ADR-0204, and ADR-0205 where applicable.
- [x] A deterministic repository check rejects unknown statuses, malformed dependencies, missing milestone references, and undocumented merged-state syntax.

## Tests

- [x] The metadata validator covers valid current files and fixtures for unknown status, missing dependency, missing issue, and malformed merge metadata.
- [x] Lint or the narrow repository verification command runs the validator in CI.

## Validation

- `yarn check:issues` (1 file, 9 tests)
- `yarn typecheck`
- `yarn constraints`
- `yarn test` (349 files, 1,887 tests)
- `yarn lint` (0 errors; 76 existing file-size warnings)
- `yarn build`
- `yarn format:check`

## Out of scope

- Renumbering historical issues or milestones.
- Rewriting issue prose unrelated to metadata.
- Hiding completed architectural history.
