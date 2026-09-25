# 3404: Remove legacy authoring paths

- Status: planned
- Milestone: 34
- Depends on: 3403
- ADR: ADR-0270

## Goal

Remove `definePlugin()`, `definePluginModule()`, public phase buckets, and their
types after migrating repository fixtures and consumers.

## Acceptance criteria

- [ ] The Core root exposes one plugin construction factory: `plugin()`.
- [ ] Tests, examples, templates, and fixtures use the canonical form.
- [ ] Superseded implementation, exports, and documentation are deleted rather
      than retained as aliases.
- [ ] Deep imports and structural forgeries remain rejected.

## Handoff

- Documentation impact: both. Pending implementation.
