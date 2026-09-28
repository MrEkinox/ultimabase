# Milestone 62: Future complexity reduction

- Status: in-progress
- Issues: 6201, 6202, 6203, 6204, 6205, 6206, 6207

Remove architectural multiplication points before adding another product
vertical. Every issue preserves current functional capabilities and must either
reduce implementation paths or make one existing boundary easier to use and
harder to widen accidentally.

## Baseline

- Revision: `b1bc0ffb`
- Production: 122,475 lines in 714 files
- Core: 66,784 lines in 357 files (54.53%)
- Tests: 133,314 lines in 741 files
- Public exports: 1,736
- Core declaration output: 592,396 bytes

## Execution order

- [x] [6201: Establish one validation contract](6201-canonical-validation-contract.md)
- [x] [6202: Converge public application ownership](6202-single-public-application-ownership.md)
- [x] [6203: Specialize plugin-owned schemas without type bridges](6203-plugin-owned-schema-specialization.md)
- [x] [6204: Protect bounded owner-private storage](6204-bounded-owner-private-storage.md)
- [ ] [6205: Converge PostgreSQL mutation planning](6205-postgres-mutation-plan-convergence.md)
- [ ] [6206: Reduce the unsupported public Core surface](6206-core-public-surface-reduction.md)
- [ ] [6207: Index the current architecture](6207-current-architecture-index.md)

Every retained abstraction must protect a current invariant or remove repeated
work across current consumers. Moving existing complexity behind an additional
facade, adding speculative registries, or preserving superseded construction
paths does not satisfy this milestone.
