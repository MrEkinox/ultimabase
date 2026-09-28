# 6207: Index the current architecture

- Status: planned
- Milestone: 62
- Packages: repository documentation and tooling
- Depends on: 6206
- ADR: none

## Goal

Make the current authoritative decision for each architectural concept directly
discoverable without rewriting or deleting historical ADR evidence.

## Acceptance criteria

- [ ] One living index maps architectural concepts to current contracts, responsible packages, and accepted or superseding ADRs.
- [ ] Historical ADR contents remain immutable except for status and explicit supersession links.
- [ ] Contradictory active prose discovered during the audit is corrected.
- [ ] A documentation guard validates index targets and current-status references.
- [ ] The final milestone report compares production lines, exports, declaration size, DX, validation cost, and preserved capabilities with the baseline.
- [ ] Documentation impact is recorded.

## Tests

- [ ] Focused active-documentation and index integrity tests.
- [ ] Complete debt-refactor validation gate.

## Out of scope

- Deleting architectural history.
- Making website prose Runtime authority.
- Adding a documentation platform.
