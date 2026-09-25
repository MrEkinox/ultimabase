# 3402: Prove representative plugin migrations

- Status: ready
- Milestone: 34
- Depends on: 3401
- ADR: ADR-0270

## Goal

Migrate a minimal fixture, Soft Delete, and Password Auth to prove the new form
across static schema/model declarations, protected Runtime providers, private
storage, application exports, operations, transports, and lifecycle work.

## Acceptance criteria

- [ ] The three representatives use only `plugin()` plus contributions.
- [ ] Their public options and exact configured-plugin types remain intact.
- [ ] Focused Runtime, Typegen, transport, lifecycle, and E2E behavior remains
      equivalent.
- [ ] Before/after authoring steps and lines are recorded.

## Handoff

- Documentation impact: both. Pending implementation.
