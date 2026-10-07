# 6503: Test atomic generated-file writing

- Status: completed
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
- Next action: none; reject the replacement and retain the existing writer.

## Experiment and decision

Rejected with no repository production, dependency, export or test change.

- Installed `write-file-atomic` 7.0.0 only in an isolated temporary directory;
  its engine range includes Node 24.0. Version 8.0.0 requires `^22.22.2 ||
^24.15.0 || >=26.0.0` and cannot be the unchanged-floor replacement.
- Actual `writer.test.ts`: 5 tests pass. The canary invokes the rebuilt public
  `writeGeneratedTypeFile`, not a copied approximation of the current writer.
- Six cases per writer: fresh nested output, prior read-only file, valid and
  dangling symlinks, failed directory replacement and concurrent complete-file
  writes. Raw package defaults differ in 2/6 cases: preserve 0444 instead of
  recreating the usual 0644 mode; follow a valid symlink and replace its target
  instead of replacing the link while retaining its target's original contents.
- Explicit mode/chown/fsync options still follow the symlink. That trial also
  shows the package's final chmod applies the mode literally: caller-computed
  umask handling is needed for exact permissions. The documented `mode: false`
  trial failed at Node's open boundary with `ERR_INVALID_ARG_TYPE`; this was an
  isolated candidate failure, not a repository test failure.
- Fresh/dangling/failed/concurrent cases with raw defaults retain complete
  contents and cleanup. Concurrent assertions check completeness, not a new
  promise of invocation-order wins, cross-process locking or multi-file atomicity.
- The public package has no option to disable realpath-based target resolution.
  Preserving destination ownership would require passing an independently named
  temporary file, then retaining the existing outer rename and failure cleanup.
  This keeps the very machinery being replaced and adds another temporary-file
  cycle, dependency and TypeScript declarations. No worthwhile simplification.
- The current write path is only 25 formatted nonblank statement-region lines.
  Do not trade its explicit destination semantics for a small gross deletion.
  Stop after the bounded comparison; no third compatibility bridge is retained.
- Reproduction canary: `/private/tmp/ultimabase-6503-atomic-canary.mjs` and its
  dedicated temporary install; cases clean up their own fixtures. The issue
  above is the durable evidence; temporary files are not a shipped test suite.

## Validation and final audit

The production tree is exactly the fully validated 6502 commit. Reuse its green
`yarn validate:full` and 729-file coverage evidence; do not rerun the full gate
for rejected experiments or Markdown-only completion. Fresh issue/checkpoint,
documentation-index and formatting checks cover the final bookkeeping. No
remaining audit finding, required failed/skipped check or unauthorized push.

`yarn vitest run --project unit tooling/issues
tooling/documentation/current-architecture-index.test.ts`: 3 files / 26 tests
pass. Targeted Prettier and `git diff --check` pass. `git diff --name-only
3f72513b -- packages tooling package.json yarn.lock` is empty.

## Documentation impact

Internal engineering documentation. Record the rejected experiment and align
the completed checkpoint/catalog. The Typegen README and public website remain
accurate because writer behavior, installation and exported contracts do not change.

## Acceptance criteria

- [x] Prove behavior with actual writer tests and a Node-24.0-compatible version.
- [x] Count net production code, dependency and behavior differences.
- [x] Retain a worthwhile exact replacement or remove the experiment.
- [x] Audit, full validation, documentation impact and final sequence report.
