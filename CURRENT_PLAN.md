# Current plan: Coverage execution efficiency

- Status: completed
- Milestone: 61
- Baseline: `ce4efbfb`
- Completed issues: 6101, 6102

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
language-service suites. Issue 6102 removed repeated program creation without
deleting or merging editor contracts. The focused editor suites are 64.6%
faster. Two complete local coverage runs finished in 246.45 and 251.58 seconds:
1.9% to 3.9% faster than issue 6101 and 42.0% to 43.1% faster than the original
two-worker baseline.
