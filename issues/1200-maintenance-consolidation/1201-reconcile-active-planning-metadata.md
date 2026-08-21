# 1201: Reconcile active planning metadata

- Status: completed
- Milestone: 12
- Packages: repository documentation
- Depends on: none
- ADR: none

## Goal

Restore one accurate active, paused, and completed planning view before the
maintenance implementation begins.

## Acceptance criteria

- [x] `ROADMAP.md`, `CURRENT_PLAN.md`, `docs/plans/README.md`, and milestone README files agree on the active objective.
- [x] Completed milestone pages link to their archived completed plan rather than the current plan.
- [x] Paused milestone pages link to their exact paused plan and resume point.
- [x] Every completed issue uses the repository's canonical `done` status.
- [x] No live documentation describes the completed Typegen rename as active.
- [x] The ACL and generated-schema plans remain paused at issues 432 and 810 respectively.
- [x] Historical accepted ADR wording remains unchanged.

## Tests

- [x] Documentation searches find no broken `CURRENT_PLAN.md` ownership claim or non-canonical completed issue status.
- [x] Markdown links touched by the issue resolve to tracked files.

## Validation evidence

- Only the roadmap, plan index, and milestone 12 page link to the active `CURRENT_PLAN.md` as its owner.
- Milestones 9, 10, and 11 link to their completed archived plans; milestone 8 links to its paused plan and issue 810 resume point.
- The ACL milestone and plan index retain the explicit issue 432 resume point.
- Repository issue searches contain no `completed` or `complete` status values.
- All touched Markdown passes Prettier and diff validation, and every referenced paused or completed plan is tracked.

## Out of scope

- Changing issue priority beyond milestone 12.
- Resuming ACL or Typegen work.
- Rewriting historical ADRs or archived plans.
