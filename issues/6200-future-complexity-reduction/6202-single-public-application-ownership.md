# 6202: Converge public application ownership

- Status: in-progress
- Milestone: 62
- Packages: `@ultimabase/core`, framework consumers
- Depends on: 6201
- ADR: proposed

## Goal

Make `UltimaBase` the sole public owner of application compilation, lifecycle,
and Runtime assembly while preserving every current advanced operation through
focused application-owned APIs.

## Acceptance criteria

- [ ] Every consumer of `FrameworkApplication`, `FrameworkEngine`, `RequestEngine`, and their factories is classified.
- [ ] An accepted ADR records the canonical public and private boundaries.
- [ ] Superseded public construction paths and duplicate lifecycle state are removed rather than bridged.
- [ ] Typegen, testing, transports, direct operations, transactions, Master authority, inspection, and disposal retain their capabilities.
- [ ] Source and packed-package editor contracts remain exact.
- [ ] Public documentation and package README contracts are updated.
- [ ] Documentation impact is recorded.

## Tests

- [ ] Lifecycle and single-active-application regressions.
- [ ] Runtime and compile-time public API tests.
- [ ] Complete debt-refactor validation gate.

## Out of scope

- A second application container.
- Giving transports an engine or application object.
- Compatibility aliases for removed construction paths.
