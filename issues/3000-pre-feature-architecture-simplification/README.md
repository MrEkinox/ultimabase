# Milestone 30 — Pre-feature architecture simplification

- Status: in-progress

Simplify the Core-facing architecture and every current official plugin before
any new product feature begins. Preserve every current product behavior and
plugin capability by default, remove only exact capabilities proven unused and
explicitly approved for removal, and derive every public surface from one
canonical compiled graph.
The user approved the exact single-active-application compatibility exception
in issue 3002 / ADR-0258. It retires concurrent initialized applications and
shared-server application routing while retaining HTTP identity and isolated
test workers; issue 3006 enforces lifecycle ownership, and issue 3007 removes shared HTTP ownership.
ADR-0259 records the ten approved extension removals, equivalent internal
performance measurements, and the retained application-operation/schema-mutation
graph. Issues 3004/3005 perform the removals; 3008–3013 consolidate the graph.
ADR-0261 records the user-approved phase clarification: declarations compile
purely; handlers and transport bindings bind at application materialization.

The active implementation contract lives in the
[pre-feature architecture simplification plan](../../docs/plans/2026-09-20-pre-feature-architecture-simplification.md).
Issue 3001 records the measured
[baseline](../../docs/plans/2026-09-20-architecture-simplification-baseline.md)
and stable [contract matrix](../../docs/plans/2026-09-20-architecture-contract-matrix.md)
used by every later audit.
No later product milestone or paused objective resumes before issue 3034 closes
this milestone.

## Execution order

1. [x] [3001 — Measure and inventory the retained contract](3001-measure-and-inventory-retained-contract.md)
2. [x] [3002 — Decide the single-active-application contract](3002-single-active-application-decision.md)
3. [x] [3003 — Decide the smaller plugin kernel and canonical graph](3003-smaller-plugin-kernel-decision.md)
4. [x] [3004 — Remove unused replacement and observer powers](3004-remove-unused-capability-replacement.md)
5. [x] [3005 — Remove unused declaration and Typegen powers](3005-remove-unused-declaration-typegen-powers.md)
6. [x] [3006 — Enforce one active UltimaBase runtime per process](3006-single-active-ultimabase-runtime.md)
7. [x] [3007 — Simplify HTTP and server application ownership](3007-simplify-http-application-ownership.md)
8. [x] [3008 — Compile one canonical command graph](3008-canonical-command-graph.md)
9. [x] [3009 — Migrate application operations to the canonical graph](3009-migrate-application-operations.md)
10. [x] [3010 — Migrate schema mutations to the canonical graph](3010-migrate-schema-mutations.md)
11. [ ] [3011 — Derive developer and Typegen surfaces](3011-derive-developer-typegen-surfaces.md)
12. [ ] [3012 — Derive REST and GraphQL transport projections](3012-derive-transport-projections.md)
13. [ ] [3013 — Delete legacy paths and consolidate verification](3013-delete-legacy-paths-consolidate-verification.md)
14. [ ] [3014 — Audit the Core and kernel simplification checkpoint](3014-core-kernel-simplification-checkpoint.md)
15. [ ] [3015 — Simplify the Access plugin](3015-simplify-access-plugin.md)
16. [ ] [3016 — Simplify the Hooks plugin](3016-simplify-hooks-plugin.md)
17. [ ] [3017 — Simplify the Validation plugin](3017-simplify-validation-plugin.md)
18. [ ] [3018 — Simplify the Roles plugin](3018-simplify-roles-plugin.md)
19. [ ] [3019 — Simplify the ACL Permissions plugin](3019-simplify-acl-permissions-plugin.md)
20. [ ] [3020 — Simplify the Password Auth plugin](3020-simplify-password-auth-plugin.md)
21. [ ] [3021 — Simplify the Soft Delete plugin](3021-simplify-soft-delete-plugin.md)
22. [ ] [3022 — Simplify the PostgreSQL plugin](3022-simplify-postgres-plugin.md)
23. [ ] [3023 — Simplify the PostgreSQL Vector plugin](3023-simplify-pg-vector-plugin.md)
24. [ ] [3024 — Simplify the HTTP plugin](3024-simplify-http-plugin.md)
25. [ ] [3025 — Simplify the Hono Server plugin](3025-simplify-server-hono-plugin.md)
26. [ ] [3026 — Simplify the REST plugin](3026-simplify-rest-plugin.md)
27. [ ] [3027 — Simplify the GraphQL plugin](3027-simplify-graphql-plugin.md)
28. [ ] [3028 — Simplify the GraphQL Yoga plugin](3028-simplify-graphql-yoga-plugin.md)
29. [ ] [3029 — Simplify the GraphiQL plugin](3029-simplify-graphiql-plugin.md)
30. [ ] [3030 — Simplify the Apollo Sandbox plugin](3030-simplify-apollo-sandbox-plugin.md)
31. [ ] [3031 — Reconcile the Core and plugin-authoring website journey](3031-reconcile-core-plugin-authoring-website-docs.md)
32. [ ] [3032 — Reconcile the data, security, and persistence website journey](3032-reconcile-data-security-persistence-website-docs.md)
33. [ ] [3033 — Reconcile the HTTP and transport website journey](3033-reconcile-http-transport-website-docs.md)
34. [ ] [3034 — Run the final simplification and parity audit](3034-final-simplification-audit.md)

Every issue depends on the previous issue's green audit. Implementation,
correction, and complete re-audit repeat until no finding remains inside the
issue scope. Only then may the issue be completed and the next one started.

Issue 3014 is a hard stop for the currently authorized run. After its green
audit and dedicated commit, report the Core checkpoint and do not inspect or
start issue 3015 without a later explicit user request.

Every issue also inherits the plan's architecture stop protocol. An uncertain
consumer, unapproved behavior loss, architectural contradiction, or need for a
new public boundary stops the issue before implementation continues. The issue
must present evidence, the smallest options, and their impact, then wait for the
user's decision. Routine defects remain in the audit loop.

Issues 3015 through 3030 audit and simplify one publishable plugin each after
the Core checkpoint. A plugin issue may make no code change when its audit finds
no safe reduction. Any public change requires an explicit stop and user
decision, then an update to the affected pages under
`apps/website/content/docs` in that same issue. Issues 3031 through 3033 perform
the final cross-page website review; package READMEs do not replace it.

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
  3034 before the milestone is marked completed.
- Every observable behavior difference from the baseline maps to an explicitly
  approved removal; no incidental regression is accepted as simplification.
