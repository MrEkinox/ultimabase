# Pre-feature architecture simplification

- Status: active
- Started: 2026-09-20
- Milestone: [30 — Pre-feature architecture simplification](../../issues/3000-pre-feature-architecture-simplification/README.md)
- Resume point: issue 3001

## Objective

Reduce the number of concepts, representations, registries, and files involved
in an ordinary framework change before adding another product capability. The
milestone preserves current developer behavior and production-used plugin
powers, removes extension contracts with no production consumer or required
kernel invariant, and converges operation declaration, application surfaces,
Typegen, REST, GraphQL, and Runtime execution on one canonical compiled graph.

This is a blocking pre-feature milestone. Planned product work, the paused ACL
objective, and additional Soft Delete work do not resume until the final issue
closes the milestone.

## Preserved behavior

- Static TypeScript schemas, JavaScript without Typegen, immutable Query and
  models, CRUD, bulk, upsert, nested writes, relations, contextual relation
  filters, and virtual results remain available.
- PostgreSQL, transactions, structural validation, Master authority,
  cancellation, Hooks, Access, ACL, Roles, Validation, Password Auth, Soft
  Delete, REST, network-independent GraphQL, Yoga, Hono, and explorer behavior
  retain their current public outcomes unless an accepted issue explicitly
  removes an unused architecture-only capability.
- Plugin authors retain the production-used ability to add schemas, fields,
  direct options, operations and schema mutations, protected policy,
  middleware, observers, transport representations, private storage, resources,
  and deterministic application-local contributions.
- Core remains independent from concrete plugins, databases, HTTP servers,
  REST, GraphQL, Access, Hooks, ACL, Roles, and authentication products.
- Product vocabulary remains owned by its plugin. Core and Access do not learn
  names such as `readDeleted`, `restore`, `login`, or `publish`.
- The mandatory Runtime order, monotonic enforcement, target locking,
  transaction boundary, structural snapshots, and non-forgeable Master
  authority remain security invariants.

## Simplification decisions to formalize

The decision issues must supersede affected accepted ADRs rather than rewriting
their history.

1. One UltimaBase application may be active in one JavaScript process. Requests
   within it remain concurrent and isolated. Tests run applications in parallel
   through existing isolated Vitest workers or processes, and may replace an
   application sequentially after complete disposal.
2. One canonical compiled command graph owns identity, authority, input and
   result contracts, private execution, surfaces, and transport metadata. Core
   exposes immutable projections of that graph instead of maintaining parallel
   planning and execution registries.
3. Public capability machinery is retained only for proven cross-plugin
   communication and required kernel invariants. Generic decoration,
   replacement, compiler replacement, Runtime replacement, Typegen contribution
   levels, query extensions, or command families with no production consumer
   are candidates for removal and must be proven by issue 3001 before deletion.
4. Typegen derives application declarations from the canonical graph. Plugins
   manually provide only type facts that cannot be derived from that graph and
   have a current production consumer.
5. Official and community plugins continue through the same retained public
   contracts. Simplification must not introduce a private official-plugin path.

## Execution order

1. [3001 — Measure and inventory the retained contract](../../issues/3000-pre-feature-architecture-simplification/3001-measure-and-inventory-retained-contract.md)
2. [3002 — Decide the single-active-application contract](../../issues/3000-pre-feature-architecture-simplification/3002-single-active-application-decision.md)
3. [3003 — Decide the smaller plugin kernel and canonical graph](../../issues/3000-pre-feature-architecture-simplification/3003-smaller-plugin-kernel-decision.md)
4. [3004 — Remove unused capability replacement powers](../../issues/3000-pre-feature-architecture-simplification/3004-remove-unused-capability-replacement.md)
5. [3005 — Remove unused declaration and Typegen powers](../../issues/3000-pre-feature-architecture-simplification/3005-remove-unused-declaration-typegen-powers.md)
6. [3006 — Enforce one active UltimaBase runtime per process](../../issues/3000-pre-feature-architecture-simplification/3006-single-active-ultimabase-runtime.md)
7. [3007 — Simplify HTTP and server application ownership](../../issues/3000-pre-feature-architecture-simplification/3007-simplify-http-application-ownership.md)
8. [3008 — Compile one canonical command graph](../../issues/3000-pre-feature-architecture-simplification/3008-canonical-command-graph.md)
9. [3009 — Migrate application operations to the canonical graph](../../issues/3000-pre-feature-architecture-simplification/3009-migrate-application-operations.md)
10. [3010 — Migrate schema mutations to the canonical graph](../../issues/3000-pre-feature-architecture-simplification/3010-migrate-schema-mutations.md)
11. [3011 — Derive developer and Typegen surfaces](../../issues/3000-pre-feature-architecture-simplification/3011-derive-developer-typegen-surfaces.md)
12. [3012 — Derive REST and GraphQL transport projections](../../issues/3000-pre-feature-architecture-simplification/3012-derive-transport-projections.md)
13. [3013 — Delete legacy paths and consolidate verification](../../issues/3000-pre-feature-architecture-simplification/3013-delete-legacy-paths-consolidate-verification.md)
14. [3014 — Run the final simplification and parity audit](../../issues/3000-pre-feature-architecture-simplification/3014-final-simplification-audit.md)

Dependencies are deliberately sequential. A later issue may not begin while an
earlier issue has an unresolved audit finding.

## Mandatory audit loop

Every issue, including documentation-only decision issues, uses this loop:

1. Implement only that issue's acceptance criteria and required documentation.
2. Run the narrowest relevant tests, then the broader gates justified by the
   affected boundaries.
3. Audit the complete issue diff, not merely the latest correction, for:
   - preservation of the baseline behavior and retained plugin powers;
   - security, authority, transaction, policy, and ownership invariants;
   - duplicate or legacy implementations that should have been removed;
   - product vocabulary leaking into Core, Access, transports, or Typegen;
   - unnecessary new abstractions, public exports, casts, dependencies, or
     future-facing extension points;
   - source, packed declarations, JavaScript, Typegen, REST, GraphQL,
     PostgreSQL, documentation, and example impact where applicable;
   - unrelated working-tree changes and scope expansion.
4. Record every finding in the issue handoff. Any unresolved finding keeps the
   issue `in-progress`.
5. Correct all findings, rerun their focused regressions, and repeat the entire
   audit from step 3. Continue until the audit is green with no unresolved
   finding inside the issue scope.
6. Run the issue's final validation, update its status and evidence, and create
   one dedicated local commit. Do not push without a separate explicit request.

An observation outside the issue scope becomes a new explicit issue. It blocks
the current issue whenever it threatens behavior parity, security, the smaller
architecture, or the ability to remove the superseded path.

## Measurement protocol

Issue 3001 records a fresh clean-checkout baseline. Each implementation issue
reports production and test line deltas, files removed or added, public export
deltas, test counts, and the measured gates it materially affects. The final
audit compares at least:

- production and test TypeScript lines and file counts;
- Core share of production code;
- public kernel concepts and exports;
- number of representations and registries per command;
- files and packages required for representative plugin changes;
- application compilation, startup, heap, and in-memory request cost;
- local test, coverage, typecheck, lint, and build durations;
- hosted build, Core package, coverage, and complete workflow durations when a
  pushed measurement is separately authorized.

Directional targets from the pre-plan audit are Core below roughly 60,000
production lines, package production near 110,000 lines, local ordinary tests
under roughly 80 seconds, and complete hosted CI below roughly 13 minutes.
These are measurement goals, not permission to delete useful behavior, weaken
coverage, or game line counts. Behavioral parity and architecture reduction
take precedence.

## Stop conditions

- A current production consumer needs a capability classified as unused.
- Removing a path would weaken request isolation, Master provenance, monotonic
  policy, transactions, structural validation, or transport safety.
- A migration starts retaining two permanent architectures instead of deleting
  the superseded path.
- An issue needs an unapproved product behavior or extension point.
- The audit loop finds a boundary change outside the accepted decision ADRs.

At a stop condition, keep the issue open, explain the evidence and smallest
options, and wait for explicit direction before expanding the architecture.

## Documentation impact

Documentation impact: both. The plan and ADRs are internal engineering sources;
issues that remove or reshape public APIs, application concurrency, plugin
authoring, transports, or Typegen must update package READMEs and affected
website pages in the same audited change.
