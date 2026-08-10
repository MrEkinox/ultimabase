# 1201: Reconcile active planning metadata

- Status: ready
- Milestone: 12
- Packages: repository documentation
- Depends on: none
- ADR: none

## Goal

Restore one accurate active, paused, and completed planning view before the
maintenance implementation begins.

## Acceptance criteria

- [ ] `ROADMAP.md`, `CURRENT_PLAN.md`, `docs/plans/README.md`, and milestone README files agree on the active objective.
- [ ] Completed milestone pages link to their archived completed plan rather than the current plan.
- [ ] Paused milestone pages link to their exact paused plan and resume point.
- [ ] Every completed issue uses the repository's canonical `done` status.
- [ ] No live documentation describes the completed Typegen rename as active.
- [ ] The ACL and generated-schema plans remain paused at issues 432 and 810 respectively.
- [ ] Historical accepted ADR wording remains unchanged.

## Tests

- [ ] Documentation searches find no broken `CURRENT_PLAN.md` ownership claim or non-canonical completed issue status.
- [ ] Markdown links touched by the issue resolve to tracked files.

## Out of scope

- Changing issue priority beyond milestone 12.
- Resuming ACL or Typegen work.
- Rewriting historical ADRs or archived plans.
