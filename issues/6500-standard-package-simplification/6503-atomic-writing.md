# 6503: Test atomic generated-file writing

- Status: planned
- Milestone: 65
- Packages: typegen
- Depends on: 6502
- ADR: none initially; preserve the generated-file writing contract

## Goal

Compare write-file-atomic with the existing writer, including existing-file
replacement, permissions, symlinks, failures and concurrent writes. Preserve
preflight and batch behavior; do not claim multi-file atomicity or cross-process
locking. Reject if the adaptation/dependency is not worthwhile.

## Acceptance criteria

- [ ] Prove behavior with actual writer tests and a Node-24.0-compatible version.
- [ ] Count net production code, dependency and behavior differences.
- [ ] Retain a worthwhile exact replacement or remove the experiment.
- [ ] Audit, full validation, documentation impact and final sequence report.
