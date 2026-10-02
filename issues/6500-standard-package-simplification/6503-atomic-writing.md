# 6503: Test atomic generated-file writing

- Status: in-progress
- Milestone: 65
- Packages: typegen
- Depends on: 6502
- ADR: none initially; preserve the generated-file writing contract

## Goal

Compare write-file-atomic with the existing writer, including existing-file
replacement, permissions, symlinks, failures and concurrent writes. Preserve
preflight and batch behavior; do not claim multi-file atomicity or cross-process
locking. Reject if the adaptation/dependency is not worthwhile.

## Working context

- Scope: generated-file writing mechanics only; keep validation and batch
  preflight unchanged. Compare in a temporary canary before repository edits.
- Current contracts: [Typegen](../../packages/typegen/README.md), writer source
  and tests; sibling rename replaces the named destination, not a symlink target.
- Locked decisions: Node 24.0 remains supported; preserve modes/ownership,
  replacement/cleanup behavior, complete files and batch error diagnostics.
- Rejected approaches: version 8 requires Node 24.15 (or specific other majors),
  so test 7.0.0, whose engine range includes 24.0. No raising the Node floor.
- Proof commands: actual writer unit tests plus isolated parity fixtures for
  fresh/read-only/symlink/failed/concurrent writes. Full gate if code is retained;
  unchanged product reuses 6502's gate with fresh documentation/checkpoint checks.
- Exploration budget: two comparable failed variants or 30 minutes without
  verifiable progress; validation wait excluded.
- Next action: install 7.0.0 into a dedicated temporary directory and compare
  raw and explicit mode/ownership options against the actual writer.

## Acceptance criteria

- [ ] Prove behavior with actual writer tests and a Node-24.0-compatible version.
- [ ] Count net production code, dependency and behavior differences.
- [ ] Retain a worthwhile exact replacement or remove the experiment.
- [ ] Audit, full validation, documentation impact and final sequence report.
