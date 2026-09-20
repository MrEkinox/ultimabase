# Milestone 30 — Pre-feature architecture simplification

- Status: planned

Simplify the application and plugin architecture before any new product feature
begins. Preserve every current product behavior and plugin capability by
default, remove only exact capabilities proven unused and explicitly approved
for removal, and derive every public surface from one canonical compiled graph.
The one-active-application-per-process proposal must likewise receive explicit
approval after its exact compatibility impact is inventoried.

The active implementation contract lives in the
[pre-feature architecture simplification plan](../../docs/plans/2026-09-20-pre-feature-architecture-simplification.md).
No later product milestone or paused objective resumes before issue 3014 closes
this milestone.

## Execution order

1. [ ] [3001 — Measure and inventory the retained contract](3001-measure-and-inventory-retained-contract.md)
2. [ ] [3002 — Decide the single-active-application contract](3002-single-active-application-decision.md)
3. [ ] [3003 — Decide the smaller plugin kernel and canonical graph](3003-smaller-plugin-kernel-decision.md)
4. [ ] [3004 — Remove unused capability replacement powers](3004-remove-unused-capability-replacement.md)
5. [ ] [3005 — Remove unused declaration and Typegen powers](3005-remove-unused-declaration-typegen-powers.md)
6. [ ] [3006 — Enforce one active UltimaBase runtime per process](3006-single-active-ultimabase-runtime.md)
7. [ ] [3007 — Simplify HTTP and server application ownership](3007-simplify-http-application-ownership.md)
8. [ ] [3008 — Compile one canonical command graph](3008-canonical-command-graph.md)
9. [ ] [3009 — Migrate application operations to the canonical graph](3009-migrate-application-operations.md)
10. [ ] [3010 — Migrate schema mutations to the canonical graph](3010-migrate-schema-mutations.md)
11. [ ] [3011 — Derive developer and Typegen surfaces](3011-derive-developer-typegen-surfaces.md)
12. [ ] [3012 — Derive REST and GraphQL transport projections](3012-derive-transport-projections.md)
13. [ ] [3013 — Delete legacy paths and consolidate verification](3013-delete-legacy-paths-consolidate-verification.md)
14. [ ] [3014 — Run the final simplification and parity audit](3014-final-simplification-audit.md)

Every issue depends on the previous issue's green audit. Implementation,
correction, and complete re-audit repeat until no finding remains inside the
issue scope. Only then may the issue be completed and the next one started.

Every issue also inherits the plan's architecture stop protocol. An uncertain
consumer, unapproved behavior loss, architectural contradiction, or need for a
new public boundary stops the issue before implementation continues. The issue
must present evidence, the smallest options, and their impact, then wait for the
user's decision. Routine defects remain in the audit loop.

## Completion boundary

- All current TypeScript, JavaScript, PostgreSQL, REST, GraphQL, authentication,
  policy, Hooks, validation, relation, nested-write, virtual-field, and Soft
  Delete behavior passes through the simplified architecture.
- Every baseline plugin capability is retained unless its exact removal was
  proven safe and explicitly approved. Every removed capability has a source,
  package, packed API, community/public contract, documentation, example,
  generated-project, invariant, and test removal audit.
- One active application per process coexists with concurrent request isolation,
  sequential disposal and replacement, and parallel isolated test workers.
- Commands have one canonical compiled representation. Developer, Typegen,
  transport, and execution views are immutable projections rather than parallel
  registries.
- No compatibility implementation, obsolete capability, or superseded planner
  remains beside the canonical path.
- Final measurements and complete repository validation are recorded in issue
  3014 before the milestone is marked completed.
- Every observable behavior difference from the baseline maps to an explicitly
  approved removal; no incidental regression is accepted as simplification.
