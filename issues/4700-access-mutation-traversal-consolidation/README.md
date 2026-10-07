# Milestone 47 — Access mutation traversal consolidation

- Status: completed
- Authorization: user request of 2026-09-26
- Baseline: `41238317`

This milestone removes Access's parallel update-expression decoder and repeated
field-value scans. Access consumes Core's canonical mutation-field traversal,
keeps bulk items isolated, and evaluates the same transition policies with
fewer intermediate collections and passes.

## Execution order

- [x] [4701 — Consolidate Access mutation traversal](4701-consolidate-access-mutation-traversal.md)

## Outcome

Access now consumes Core's canonical mutation-field traversal, indexes each
materialized field value once, and evaluates affected scalar, relation, and
static transition rules without the previous repeated scans. Production
TypeScript is smaller, both touched Runtime modules remain below the warning
budget, and all authorization capabilities and stages remain intact.

No push is authorized.
