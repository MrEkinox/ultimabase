# 6207: Index the current architecture

- Status: completed
- Milestone: 62
- Packages: repository documentation and tooling
- Depends on: 6206
- ADR: none

## Goal

Make the current authoritative decision for each architectural concept directly
discoverable without rewriting or deleting historical ADR evidence.

## Acceptance criteria

- [x] One living index maps architectural concepts to current contracts, responsible packages, and accepted or superseding ADRs.
- [x] Historical ADR contents remain immutable except for status and explicit supersession links.
- [x] Contradictory active prose discovered during the audit is corrected.
- [x] A documentation guard validates index targets and current-status references.
- [x] The final milestone report compares production lines, exports, declaration size, DX, validation cost, and preserved capabilities with the baseline.
- [x] Documentation impact is recorded.

## Tests

- [x] Focused active-documentation and index integrity tests.
- [x] Complete debt-refactor validation gate.

## Out of scope

- Deleting architectural history.
- Making website prose Runtime authority.
- Adding a documentation platform.

## Implementation

- [`docs/current-architecture.md`](../../docs/current-architecture.md) is the
  living concept index. It routes each maintained concept to its contract,
  responsible code, and accepted ADRs without replacing any of them.
- The documentation guard validates the complete concept list, every local
  target, every current ADR status, and the current/superseded partitions of
  the ADR catalog.
- The audit moved ADR-0003, ADR-0125, and ADR-0214 out of the current catalog;
  their historical records were not modified. Partially superseded ADR-0045
  and ADR-0046 remain correctly classified as active in part.
- Root private-storage prose now says `versioned physical provenance` rather
  than implying that the removed migration product still exists.
- The [milestone final audit](../../docs/plans/2026-09-28-future-complexity-reduction-final-audit.md)
  records the baseline comparison, DX outcome, validation cost, preserved
  capabilities, and remaining debt.

## Completion evidence

- Focused documentation guard: 1 file and 3 tests passed.
- `yarn validate:full`: 549 ordinary files and 2,600 tests; 624 coverage files
  and 2,848 tests; statements 90.91% (23,707/26,075), branches 84.49%
  (14,686/17,381), functions 96.07% (5,000/5,204), and lines 91.47%
  (22,995/25,137). Type checking, lint, builds, issue metadata, and website
  validation also passed.
- Documentation impact: internal engineering documentation. The issue indexes
  existing architecture and corrects repository engineering prose without
  changing a package contract or public website behavior.
