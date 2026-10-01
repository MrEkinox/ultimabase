# Milestone 61: Coverage execution efficiency

- Status: completed
- Issues: 6101, 6102, 6103

Reduce local complete-coverage feedback time while retaining the GitHub runner's
proven memory-safe worker bound and every existing validation capability.

## Execution order

- [x] [6101: Separate local and hosted coverage parallelism](6101-separate-local-and-hosted-coverage-parallelism.md)
- [x] [6102: Reuse language-service programs](6102-reuse-language-service-programs.md)
- [x] [6103: Reuse compatible editor workspaces](6103-reuse-compatible-editor-workspaces.md)

## Current outcome

Issue 6101's user-approved post-milestone-63 CI worker correction is complete
on 2026-10-02. Full validation passes with two ordinary coverage workers and
one performance worker: 637 files, 2,922 tests, identical production coverage.
No check or budget changed. Hosted confirmation awaits an authorized push.
The original measurements below remain historical.

Local complete coverage is now 45.5% to 49.6% faster than the original
two-worker baseline. GitHub remains fixed at its proven two-worker safety
bound, while compatible editor checks reuse versioned multi-file
language-service workspaces without removing any test, assertion, project,
report, threshold, or production coverage.

The final two complete runs finished in 235.97 and 218.51 seconds with all 621
files, 2,836 tests, and coverage counters unchanged. The identical 38-file
editor profile retained all 223 tests and fell from 19.82 seconds to a repeated
17.69-17.74-second range.
