# 3502: Prove parity and audit the reduction

- Status: planned
- Milestone: 35
- Depends on: 3501
- ADR: ADR-0271

## Goal

Prove complete behavior parity and measure whether the native plan actually
reduces Core and test complexity while improving plugin-author diagnostics.

## Acceptance criteria

- [ ] Full validation and coverage pass without regression.
- [ ] The removed bridge has no implementation, type, test, or documentation
      remnants outside historical ADRs and completed issues.
- [ ] Production and test line changes are compared with milestone 34's final
      commit `8800ea99`.
- [ ] Remaining plugin-author complexity and justified follow-up work are
      recorded.

## Handoff

- Documentation impact: internal engineering documentation. Pending audit.
