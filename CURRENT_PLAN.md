# Current plan: Future complexity reduction

- Status: completed
- Milestone: 62
- Baseline: `b1bc0ffb`
- Completed issues: 6201, 6202, 6203, 6204, 6205, 6206, 6207
- Active issue: none

Remove architectural choices that multiply the cost of future work without
removing any current product capability. The milestone establishes one local
and hosted validation contract, converges public application ownership, makes
plugin-owned schema specialization type-safe, protects the bounded private
storage contract, audits PostgreSQL mutation planning, reduces unnecessary
public Core surface, and makes current architectural decisions directly
discoverable.

Each issue remains independently measurable and receives a dedicated commit.
Architectural migrations remove superseded paths rather than retaining
compatibility bridges. Runtime order, security, lifecycle, Typegen, transport,
adapter, editor, and public behavior remain protected by the complete validation
gate.

The [final audit](docs/plans/2026-09-28-future-complexity-reduction-final-audit.md)
records the measured result, preserved capabilities, validation evidence, and
remaining debt.

No push is authorized.
