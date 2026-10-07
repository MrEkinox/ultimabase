# 012: Reconcile recent public API documentation

- Status: completed
- Milestone: 0
- Packages: repository documentation, `@ultimabase/core`, `@ultimabase/postgres-plugin`
- Depends on: 011, 352, 353
- ADR: ADR-0133 through ADR-0165

## Goal

Restore one current description of Query, mutation, Access, hook, and embedded
object behavior after the recent pre-release API decisions, without rewriting
the historical context retained by accepted ADRs.

## Acceptance criteria

- [x] Agent instructions and architecture describe the item-oriented mutation
      pipeline and the current grouped hook surface.
- [x] The roadmap and current plan distinguish active work from a paused resume
      point.
- [x] Current Query, Runtime, and Access guides contain no set-based public
      mutation or removed read-hook behavior.
- [x] Historical ADRs link visibly to the decisions that refine or supersede
      their obsolete public behavior.
- [x] Obsolete planned issues are marked superseded and completed issue status
      vocabulary is normalized to `done`.
- [x] Implemented object JSONB and PostgreSQL E2E backlog entries record their
      current evidence instead of remaining future work.

## Tests

- [x] Documentation searches find no removed public hook names, public atomic
      option, or set-based generated-schema mutation claims outside historical ADRs
      and completed plans.
- [x] Repository status preserves unrelated developer changes.
