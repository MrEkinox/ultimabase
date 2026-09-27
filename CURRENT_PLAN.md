# Current plan: Coverage execution efficiency

- Status: paused
- Milestone: 61
- Baseline: `ce4efbfb`
- Completed issue: 6101
- Resume point: 6102 after explicit approval

Reduce local complete-coverage wall time without removing tests, projects,
reports, thresholds, or production coverage. Local execution may use four
workers, while GitHub retains its proven two-worker memory-safety bound through
Vitest's native environment override.

Profile the resulting complete run and record which suites dominate execution
time before proposing any further test reorganization.

No push is authorized.

## Current outcome

Local complete coverage now uses four workers and completes in 256.34 seconds,
40.9% faster than the measured two-worker baseline. GitHub explicitly retains
two workers through `VITEST_MAX_WORKERS`.

The profile attributes 72.7% of cumulative file time to editor and TypeScript
language-service suites. Issue 6102 proposes removing repeated program creation
without deleting or merging editor contracts; implementation is not yet
authorized.
