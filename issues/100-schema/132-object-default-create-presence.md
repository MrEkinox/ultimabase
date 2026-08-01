# 132: Align object defaults with create inputs

- Status: done
- Milestone: 1
- Packages: schema
- Depends on: 131
- ADR: 0034

## Goal

Make static object defaults accept the same child omissions as create inputs.

## Acceptance criteria

- [x] Required children without a supplier remain mandatory.
- [x] Optional, defaulted, generated, and auto-incremented children may be omitted.
- [x] Unknown and invalid provided values remain declaration errors.
- [x] Runtime and compile-time contracts agree.
