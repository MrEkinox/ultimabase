# 3403: Migrate every production plugin

- Status: planned
- Milestone: 34
- Depends on: 3402
- ADR: ADR-0270

## Goal

Move every official and repository-owned production plugin to the proven
contribution-first form without changing product behavior.

## Acceptance criteria

- [ ] Every production plugin uses `plugin()` and one contributions list.
- [ ] No production plugin spells internal declaration/setup/hook buckets.
- [ ] Options, identities, instances, relationships, claims, exports, and
      privilege diagnostics remain equivalent.
- [ ] Package-focused tests pass for every migrated plugin.

## Handoff

- Documentation impact: both. Pending implementation.
