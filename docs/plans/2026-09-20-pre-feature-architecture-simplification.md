# Pre-feature architecture simplification

- Status: active — plugin wave resumed by explicit user request
- Started: 2026-09-20
- Milestone: [30 — Pre-feature architecture simplification](../../issues/3000-pre-feature-architecture-simplification/README.md)
- Resume point: issue 3030; authorized through the final audit in 3034
- Baseline: [issue 3001 measurements](2026-09-20-architecture-simplification-baseline.md)
- Preservation ledger: [architecture contract matrix](2026-09-20-architecture-contract-matrix.md)

## Objective

Reduce the number of concepts, representations, registries, and files involved
in an ordinary framework or plugin change before adding another product
capability. The milestone first simplifies the Core-facing architecture, then
audits and simplifies every current official plugin. It preserves current
developer behavior and plugin capabilities by default, removes only
capabilities proven unused and explicitly approved for removal, and converges
operation declaration, application surfaces, Typegen, REST, GraphQL, and
Runtime execution on one canonical compiled graph.

This is a blocking pre-feature milestone. Planned product work, the paused ACL
objective, and additional Soft Delete work do not resume until issue 3034
closes the milestone.

## Preserved behavior

- Static TypeScript schemas, JavaScript without Typegen, immutable Query and
  models, CRUD, bulk, upsert, nested writes, relations, contextual relation
  filters, and virtual results remain available.
- PostgreSQL, transactions, structural validation, Master authority,
  cancellation, Hooks, Access, ACL, Roles, Validation, Password Auth, Soft
  Delete, REST, network-independent GraphQL, Yoga, Hono, and explorer behavior
  retain their current public outcomes except approved D-001 / ADR-0258 and
  exact unused architecture-only capabilities selected in ADR-0259, plus the
  separately approved descriptive Typegen inspection boundary in ADR-0262.
- Plugin authors retain every currently supported ability to add schemas, fields,
  direct options, application operations and schema mutations, protected policy,
  middleware, product-owned observers, transport representations, private storage, resources,
  and deterministic application-local contributions.
- Core remains independent from concrete plugins, databases, HTTP servers,
  REST, GraphQL, Access, Hooks, ACL, Roles, and authentication products.
- Product vocabulary remains owned by its plugin. Core and Access do not learn
  names such as `readDeleted`, `restore`, `login`, or `publish`.
- The mandatory Runtime order, monotonic enforcement, target locking,
  transaction boundary, structural snapshots, and non-forgeable Master
  authority remain security invariants.

## Preservation and removal contract

The burden of proof is on removal. Every behavior and plugin capability that
exists at the issue 3001 baseline is retained unless its exact removal is
approved through issues 3002 or 3003, or through a later architecture stop that
explicitly reopens and updates the contract matrix. The user approved D-001's
used-capability exception through ADR-0258. On 2026-09-20, after reviewing the
issue 3003 removal inventory, the user also approved removing capabilities with
no concrete current use and adding them back only when needed. Other removal
candidates must have no:

- production source consumer, official plugin consumer, or current application
  consumer;
- actual engineering-tool or generated-project dependency;
- required architecture, security, authority, transaction, lifecycle,
  isolation, transport, TypeScript, JavaScript, or conformance invariant.

A capability's own implementation, public exports, documentation, illustrative
examples, and self-testing fixtures alone do not establish a concrete consumer
or justify retention. Record their removal and update the website; do not keep
compatibility wrappers or speculative substitutes. Actual engineering-tool
usage and tests protecting a retained invariant do count: preserve the need,
and obtain approval before removing a used public API while moving that need
elsewhere. If consumer evidence is incomplete, contradictory, or ambiguous,
retain the capability and invoke the architecture stop protocol.

The [issue 3003 proposal](2026-09-20-smaller-kernel-decision-proposal.md) selects
all R-001 through R-010 under this rule and the explicitly approved performance
probe exception: retain its measurements internally and remove its public API.
The subsequent audit corrected three baseline consumer attributions. The user
explicitly approved those findings as R-008 through R-010; ADR-0259 records the
exact additional removals and the retained application-operation/schema-mutation
graph. No code removal
starts before issue 3003's final audit and accepted ADR.

Issue 3011 subsequently used the architecture stop protocol. The user approved
[ADR-0262](../adr/0262-descriptive-typegen-command-inspection.md): the existing
Typegen graph keeps descriptive facts, without executable snapshot callbacks or
schema constructors. Direct execution and generated declarations remain intact;
D-005 records this exact approved difference in the preservation ledger.

Except for the exact approved removals, parity means observable equivalence for
successful results, public and safe errors, side effects and ordering, Hooks and
policies, transactions and rollback, authority provenance, lifecycle cleanup,
TypeScript inference and editor behavior, JavaScript without Typegen, package
exports, examples, REST routes and envelopes, and GraphQL schemas and errors.
Every intentional difference must map to one explicitly approved removal.
Issue 3001 records these facts in a versioned contract matrix with a stable ID,
owner, public surfaces, consumers or invariant, baseline evidence, retention or
removal decision, and regression coverage for every behavior and capability.
Every later issue audits its diff against that same matrix.

## Simplification decisions to formalize

The decision issues must supersede affected accepted ADRs rather than rewriting
their history.

1. Accepted by the user and [ADR-0258](../adr/0258-single-active-application-lifecycle.md):
   one initialized UltimaBase application per JavaScript realm, concurrent
   isolated requests, sequential replacement after complete disposal, and
   parallel isolated test workers. HTTP identity remains; same-process
   concurrent initialization, shared Hono hosting, and the mount-table API are
   explicitly retired. Issues 3006/3007 implement this bounded exception.
2. One canonical compiled command graph owns identity, authority, input and
   result contracts, private execution, surfaces, and transport metadata. Core
   exposes immutable projections of that graph instead of maintaining parallel
   planning and execution registries. The explicitly approved
   [ADR-0261](../adr/0261-command-compilation-and-binding-phases.md) fixes two
   construction phases: pure declaration compilation, then exact binding
   materialization before transport consumers. Factories and public plugin
   APIs retain their existing lifecycle.
3. Public capability machinery is retained for concrete current consumers and
   required kernel invariants. Public exposure alone is not a consumer. Generic
   decoration, replacement, compiler replacement, Runtime replacement, Typegen
   contribution levels, query extensions, or command families with no current
   consumer are candidates for removal. Issue 3001 must prove each candidate
   unused and issue 3003 must record the exact authorized removal list before
   deletion. The approved unused-power rule applies to the reviewed inventory;
   a used-capability exception still requires an explicit user decision.
4. Typegen derives application declarations from the canonical graph. Plugins
   manually provide only type facts that cannot be derived from that graph and
   have a current production consumer.
5. Official and community plugins continue through the same retained public
   contracts. Simplification must not introduce a private official-plugin path.

## Plugin simplification wave

Issue 3014 is the checkpoint between the Core/kernel migration and plugin-local
work. After it is green, every current publishable plugin receives one bounded
issue: Access, Hooks, Validation, Roles, ACL Permissions, Password Auth, Soft
Delete, PostgreSQL, PostgreSQL Vector, HTTP, Hono Server, REST, GraphQL, GraphQL
Yoga, GraphiQL, and Apollo Sandbox.

Each plugin issue must:

- measure the package after the Core checkpoint and map its public contract to
  the issue 3001 contract matrix;
- remove duplicated compilation, normalization, registration, lifecycle,
  projection, error, and test machinery that the simplified Core makes
  unnecessary;
- preserve ownership, dependency direction, security, transactions, lifecycle,
  TypeScript, JavaScript, packed-package, and transport behavior;
- avoid extracting a shared abstraction unless at least two current consumers
  need it to enforce one current invariant;
- stop and propose an explicit cross-plugin issue when a safe simplification
  requires coordinated edits outside the package currently in scope;
- stop for user review before any public behavior, configuration, export, error,
  or extension contract changes;
- update the affected website pages and package README in the same issue when a
  public change is explicitly approved.

The package audit may conclude that no safe simplification is available. In
that case it records the evidence and makes no churn solely to reduce a metric.
Later discoveries never amend the removal list implicitly: the current issue
stays open while the user reviews the evidence, compatibility impact, contract
matrix update, and any proposed additional issue.

## Public website documentation contract

The public documentation means the Fumadocs site under
`apps/website/content/docs`. Package READMEs remain engineering sources but do
not satisfy this contract. Every implementation issue uses
`apps/website/content/documentation-ownership.json` and page-level `sources`
metadata to identify affected pages. A public change is incomplete until those
pages are updated and validated in the same issue.

After every plugin issue is complete, issues 3031 through 3033 review the site
as three complete reader journeys: Core and plugin authoring; data, security,
identity, and persistence; HTTP, REST, GraphQL, and explorers. These issues fix
cross-page sequencing, stale examples, terminology, navigation, and migration
explanations that a package-local edit cannot reliably catch. They are
verification and editorial reconciliation, not permission to defer known site
updates from an earlier issue.

## Execution order

1. [3001 — Measure and inventory the retained contract](../../issues/3000-pre-feature-architecture-simplification/3001-measure-and-inventory-retained-contract.md)
2. [3002 — Decide the single-active-application contract](../../issues/3000-pre-feature-architecture-simplification/3002-single-active-application-decision.md)
3. [3003 — Decide the smaller plugin kernel and canonical graph](../../issues/3000-pre-feature-architecture-simplification/3003-smaller-plugin-kernel-decision.md)
4. [3004 — Remove unused replacement and observer powers](../../issues/3000-pre-feature-architecture-simplification/3004-remove-unused-capability-replacement.md)
5. [3005 — Remove unused declaration and Typegen powers](../../issues/3000-pre-feature-architecture-simplification/3005-remove-unused-declaration-typegen-powers.md)
6. [3006 — Enforce one active UltimaBase runtime per JavaScript realm](../../issues/3000-pre-feature-architecture-simplification/3006-single-active-ultimabase-runtime.md)
7. [3007 — Simplify HTTP and server application ownership](../../issues/3000-pre-feature-architecture-simplification/3007-simplify-http-application-ownership.md)
8. [3008 — Compile one canonical command graph](../../issues/3000-pre-feature-architecture-simplification/3008-canonical-command-graph.md)
9. [3009 — Migrate application operations to the canonical graph](../../issues/3000-pre-feature-architecture-simplification/3009-migrate-application-operations.md)
10. [3010 — Migrate schema mutations to the canonical graph](../../issues/3000-pre-feature-architecture-simplification/3010-migrate-schema-mutations.md)
11. [3011 — Derive developer and Typegen surfaces](../../issues/3000-pre-feature-architecture-simplification/3011-derive-developer-typegen-surfaces.md)
12. [3012 — Derive REST and GraphQL transport projections](../../issues/3000-pre-feature-architecture-simplification/3012-derive-transport-projections.md)
13. [3013 — Delete legacy paths and consolidate verification](../../issues/3000-pre-feature-architecture-simplification/3013-delete-legacy-paths-consolidate-verification.md)
14. [3014 — Audit the Core and kernel simplification checkpoint](../../issues/3000-pre-feature-architecture-simplification/3014-core-kernel-simplification-checkpoint.md)
15. [3015 — Simplify the Access plugin](../../issues/3000-pre-feature-architecture-simplification/3015-simplify-access-plugin.md)
16. [3016 — Simplify the Hooks plugin](../../issues/3000-pre-feature-architecture-simplification/3016-simplify-hooks-plugin.md)
17. [3017 — Simplify the Validation plugin](../../issues/3000-pre-feature-architecture-simplification/3017-simplify-validation-plugin.md)
18. [3018 — Simplify the Roles plugin](../../issues/3000-pre-feature-architecture-simplification/3018-simplify-roles-plugin.md)
19. [3019 — Simplify the ACL Permissions plugin](../../issues/3000-pre-feature-architecture-simplification/3019-simplify-acl-permissions-plugin.md)
20. [3020 — Simplify the Password Auth plugin](../../issues/3000-pre-feature-architecture-simplification/3020-simplify-password-auth-plugin.md)
21. [3021 — Simplify the Soft Delete plugin](../../issues/3000-pre-feature-architecture-simplification/3021-simplify-soft-delete-plugin.md)
22. [3022 — Simplify the PostgreSQL plugin](../../issues/3000-pre-feature-architecture-simplification/3022-simplify-postgres-plugin.md)
23. [3023 — Simplify the PostgreSQL Vector plugin](../../issues/3000-pre-feature-architecture-simplification/3023-simplify-pg-vector-plugin.md)
24. [3024 — Simplify the HTTP plugin](../../issues/3000-pre-feature-architecture-simplification/3024-simplify-http-plugin.md)
25. [3025 — Simplify the Hono Server plugin](../../issues/3000-pre-feature-architecture-simplification/3025-simplify-server-hono-plugin.md)
26. [3026 — Simplify the REST plugin](../../issues/3000-pre-feature-architecture-simplification/3026-simplify-rest-plugin.md)
27. [3027 — Simplify the GraphQL plugin](../../issues/3000-pre-feature-architecture-simplification/3027-simplify-graphql-plugin.md)
28. [3028 — Simplify the GraphQL Yoga plugin](../../issues/3000-pre-feature-architecture-simplification/3028-simplify-graphql-yoga-plugin.md)
29. [3029 — Simplify the GraphiQL plugin](../../issues/3000-pre-feature-architecture-simplification/3029-simplify-graphiql-plugin.md)
30. [3030 — Simplify the Apollo Sandbox plugin](../../issues/3000-pre-feature-architecture-simplification/3030-simplify-apollo-sandbox-plugin.md)
31. [3031 — Reconcile the Core and plugin-authoring website journey](../../issues/3000-pre-feature-architecture-simplification/3031-reconcile-core-plugin-authoring-website-docs.md)
32. [3032 — Reconcile the data, security, and persistence website journey](../../issues/3000-pre-feature-architecture-simplification/3032-reconcile-data-security-persistence-website-docs.md)
33. [3033 — Reconcile the HTTP and transport website journey](../../issues/3000-pre-feature-architecture-simplification/3033-reconcile-http-transport-website-docs.md)
34. [3034 — Run the final simplification and parity audit](../../issues/3000-pre-feature-architecture-simplification/3034-final-simplification-audit.md)

Dependencies are deliberately sequential. A later issue may not begin while an
earlier issue has an unresolved audit finding.

Issue 3014 completed the originally authorized Core/kernel run and its explicit
stop was observed. The user subsequently authorized issues 3015–3034. The current
execution stops after the final milestone audit; architectural decisions still
require an explicit stop and user review.

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

## Architecture stop protocol

Routine implementation defects are fixed inside the audit loop. Stop the
current issue before modifying code or accepting an ADR when evidence reveals:

- an architectural contradiction or a boundary not covered by the accepted
  decisions;
- uncertainty about whether a capability, contract, or behavior is unused;
- behavior loss beyond an exact explicitly approved removal;
- a need for a new public abstraction, compatibility path, privilege, or
  extension point;
- a choice whose security, lifecycle, transport, or plugin impact cannot be
  resolved from the current contract.

Record the evidence, explain why continuing would be unsafe, present the
smallest viable options with their behavior and architecture impact, and wait
for an explicit user decision. Do not hide the conflict behind a compatibility
layer or silently widen the issue.

## Measurement protocol

Issue 3001 records a fresh clean-checkout baseline. Issue 3014 records the
post-Core checkpoint, and each plugin issue records its package-local starting
point. Every implementation issue reports production and test line deltas,
files removed or added, public export deltas, test counts, and the measured
gates it materially affects. The final audit compares at least:

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
- A concrete community consumer, generated project, engineering tool, or
  required invariant needs a capability classified as unused. Public exports
  and documentation alone do not reopen an approved unused-power removal.
- Evidence is insufficient to prove that a removal candidate is unused.
- Removing a path would weaken request isolation, Master provenance, monotonic
  policy, transactions, structural validation, or transport safety.
- A migration starts retaining two permanent architectures instead of deleting
  the superseded path.
- An issue needs an unapproved product behavior or extension point.
- The audit loop finds a boundary change outside the accepted decision ADRs.

At a stop condition, keep the issue open and follow the architecture stop
protocol before changing the disputed boundary.

## Documentation impact

Documentation impact: both. The plan and ADRs are internal engineering sources.
Issues that remove or reshape public APIs, application concurrency, plugin
authoring, transports, or Typegen must update package READMEs and affected pages
under `apps/website/content/docs` in the same audited change. Issues 3031
through 3033 then verify the complete public website journeys before the final
audit.

## Authorized checkpoint reached

Issues 3001–3014 are complete and independently committed after their audit
loops. The [3014 report](2026-09-21-core-kernel-simplification-checkpoint.md)
records retained contracts, approved differences, clean-checkout verification,
measured reductions and baselines for the 16 later plugin audits. The Core run
paused here as requested. The plugin wave is now explicitly resumed below; no
new feature resumes and nothing is pushed. Milestone 30 is not complete.

## Explicit resumption after the Core checkpoint

The user authorized autonomous continuation through issues 3015–3034 after
reviewing the Core simplification outcome. The original 3014 stop was observed.
The same per-issue audit loop, dedicated local commits, architecture stop and
public website obligations apply. Stop after 3034; do not create or implement
a later simplification milestone. No push is authorized.
