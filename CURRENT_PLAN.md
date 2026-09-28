# Current plan: Future complexity reduction

- Status: in-progress
- Milestone: 62
- Baseline: `b1bc0ffb`
- Completed issues: 6201
- Active issue: 6202

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

No push is authorized.
