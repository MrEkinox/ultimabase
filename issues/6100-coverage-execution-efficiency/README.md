# Milestone 61: Coverage execution efficiency

- Status: completed
- Issues: 6101, 6102

Reduce local complete-coverage feedback time while retaining the GitHub runner's
proven memory-safe worker bound and every existing validation capability.

## Execution order

- [x] [6101: Separate local and hosted coverage parallelism](6101-separate-local-and-hosted-coverage-parallelism.md)
- [x] [6102: Reuse language-service programs](6102-reuse-language-service-programs.md)

## Current outcome

Local complete coverage is 42.0% to 43.1% faster than the original two-worker
baseline. GitHub remains fixed at its proven two-worker safety bound, while
compatible editor checks reuse language-service programs without removing any
test, assertion, project, report, threshold, or production coverage.
