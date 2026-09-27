# Milestone 61: Coverage execution efficiency

- Status: in-progress
- Issue: 6101

Reduce local complete-coverage feedback time while retaining the GitHub runner's
proven memory-safe worker bound and every existing validation capability.

## Execution order

- [x] [6101: Separate local and hosted coverage parallelism](6101-separate-local-and-hosted-coverage-parallelism.md)
- [ ] [6102: Reuse language-service programs](6102-reuse-language-service-programs.md)

## Current outcome

Local complete coverage is 40.9% faster with four workers while GitHub remains
fixed at its proven two-worker safety bound. Profiling identifies repeated
TypeScript language-service construction as the next bounded optimization.
