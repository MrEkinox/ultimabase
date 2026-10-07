# ADR-0259: Smaller plugin kernel and canonical commands

- Status: accepted
- Date: 2026-09-20
- Refines: ADR-0186, ADR-0187, ADR-0188, ADR-0189, ADR-0190, ADR-0191, ADR-0192, ADR-0193, ADR-0194, ADR-0195, ADR-0196, ADR-0197, ADR-0198, ADR-0199, ADR-0200, ADR-0240, ADR-0245
- Depends on: ADR-0258
- Implementation: issues 3004, 3005, and 3008 through 3013
- Evidence: [reviewed inventory and audit](../plans/2026-09-20-smaller-kernel-decision-proposal.md)

## Context and approval

The kernel supports extension mechanisms without a current application or
official plugin consumer. Their declarations, capability planning, public
types, serialization, and tests impose a cost even when no product uses them.
Separately, application operations and schema mutations repeat identity,
ownership, surface, and transport facts in independent compiled stores.

The user approved removing unused mechanisms and reintroducing them only for
a concrete need. A mechanism's own implementation, exports, documentation,
illustrative examples, and tests do not alone establish current use. Actual
product and engineering-tool consumers and required security, lifecycle, or
conformance invariants remain preservation obligations.

The user reviewed R-001 through R-007, explicitly approved internalizing the
used performance measurements, and then approved the three additional audit
findings A-001 through A-003. Those findings become R-008 through R-010 below.
This decision accepts these exact public extension-API changes. It does not
authorize removing another product feature or inventing a substitute mechanism.

## Exact removals

| ID    | Removed public power                                                                    | Implementation issue | Preserved need                                                                                 |
| ----- | --------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| R-001 | Generic `decorateCapability` and `capability:decorate`                                  | 3004                 | Explicit provider composition and Runtime middleware                                           |
| R-002 | Generic `replaceCapability` and `capability:replace`                                    | 3004                 | One deterministic provider graph with conflict detection                                       |
| R-003 | `replaceSchemaCompiler`, `schema:replace`, and the public replaceable compiler protocol | 3004                 | Direct canonical compilation with validation and provenance                                    |
| R-004 | `replaceRuntime`, `runtime:replace`, and the public replaceable executor protocol       | 3004                 | Canonical Runtime, optional stages, and equivalent internal cost measurements                  |
| R-005 | Query extension registration, `defineQueryExtension`, and `query:extend`                | 3005                 | Ordinary Query, filters, CRUD, and schema mutations                                            |
| R-006 | Manual structured main-output Typegen contributions and `typegen:contribute`            | 3005                 | Graph-derived declarations and consumed nominal type references                                |
| R-007 | Plugin-owned extra Typegen outputs and `typegen:emit`                                   | 3005                 | Normal deterministic application declaration generation                                        |
| R-008 | Destructive schema patches and `schema:transform`                                       | 3005                 | Additive contributions, option declarations, selectors, and ownership checks                   |
| R-009 | Generic Core Runtime observer protocol and factories                                    | 3004                 | Product-owned Hooks/Access observers, events, and `runtime:observe`                            |
| R-010 | Arbitrary plugin operations targeting a schema/model and their generic command maps     | 3005                 | Application operations, Password Auth factory methods, and schema/model-bound schema mutations |

Every row includes its obsolete factories, interfaces, barrel exports,
privileges where named, manifest/inspection branches, snapshot and generator
branches, documentation, examples, and self-testing fixtures. Rejection tests
may name removed input, but no compatibility alias, inert option, hidden
official-plugin substitute, or alternate registry remains. Unknown removed
privileges and declarations fail rather than becoming no-ops.

R-003 removes the provider-selection protocol, its token, replacement target,
and callback carrier. The canonical compiler remains Core-owned. Shared inert
schema facts still needed by the compiled graph or Typegen remain available
through their actual consuming boundary; they do not retain a public way to
select or execute another compiler. Mandatory structural, relationship,
ownership, and provenance validation remains even when its original tests
injected malformed output through compiler replacement.

R-004 also removes `RuntimeCostProbe`, `RuntimeCostProbeOptions`,
`RuntimeCostSnapshot`, `diffRuntimeCostSnapshots`, and
`assertNoOptionalRuntimeCost` from `@ultimabase/testing`. The four existing
no-product/Hooks/Access/combined scenarios must still measure actual canonical
assembly, stage invocation, and database work. Move instrumentation into
Core-owned test support before deleting its old path. Do not introduce a new
public metrics capability, production test switch, neutral optional stage, or
private cross-package production import. If equivalent measurement cannot be
preserved within this boundary, stop and reopen the decision.

R-008 removes field replacement/rename/removal; index and constraint
replacement/removal; schema/field option removal; and the existing-owner
replacement variants of option setters. The corresponding `target` contracts
disappear. Additive field/index/constraint contributions and additive option
setters remain under `schema:declare`. Duplicate or conflicting contributions
remain errors; removing replacement is not permission for last-writer-wins.

R-009 removes `runtimeObserverCapability`, `provideRuntimeObserver`, the
generic `postCommitEvent` contribution factory, and their exclusive contracts
and assembly branches. The similarly named `runtime:observe` privilege stays:
Hooks event consumers and Access/Hook diagnostics own separate actual
capabilities. Post-commit delivery, rollback suppression, callback attribution,
and diagnostic isolation remain requirements of those retained paths.

R-010 removes `schemaCommands` and `modelCommands` for arbitrary operations,
their schema/model operation targets, handle entry points, and generated maps.
`defineOperation` continues to represent application operations. The
`schemaMutations` mechanism, its schema and persisted-model surfaces, native
model CRUD, and `AppUser.signUp/login/refresh/logout` remain. An arbitrary
operation must not be silently recast as a schema mutation to preserve the
removed route.

## Retained kernel

The [contract matrix](../plans/2026-09-20-architecture-contract-matrix.md)
names B-001 through B-012, P-001 through P-023, and C-001 through C-039.
It remains the complete parity ledger, subject only to ADR-0258 and the exact
removals above. C-034 and C-037 become direct Core implementation boundaries;
C-036 is removed. All other listed protocols retain their current owning
package and public purpose. This decision does not begin the later
plugin-by-plugin simplification wave.

Every retained contribution shares these invariants: exact structured plugin
and optional instance identity, privilege validation before effects, nominal
provenance, deterministic dependency/configuration/registration order,
declaration purity, application-owned resources, and complete cleanup.
Application values cannot leak to another lifecycle; request authority,
transactions, cancellation, and callback ownership remain request-local under
ADR-0258. Official and community plugins use the same public boundary.

| Matrix powers | Retained contribution and required invariant                                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P-001–P-004   | Schemas, contextual fields and codecs, direct options, selectors, and additive patches. Atomic compilation preserves Core system fields, normalized option ownership, frozen selections, relationship integrity, and Typegen facts. Destructive patches alone are R-008.             |
| P-005–P-007   | Application operations and schema mutations, including class, schema-handle, and persisted-model mutation methods. Keep nominal identity, separate execution semantics, exact errors/input/result contracts, immutable models, and the R-010 distinction.                            |
| P-008         | Owner-private storage. Credentials/sessions stay outside ordinary Query, Typegen, CRUD, Access, Hooks, and foreign plugin access.                                                                                                                                                    |
| P-009–P-011   | Versioned capability definition, provision, requirements, optional requirements, single/multiple/pipeline cardinalities, explicit plugin instances, dependencies/peers, deterministic flattening and resource lifecycle. No replacement/decorator branch remains.                    |
| P-012–P-015   | Ordered behavior/interceptors, monotonically narrowing constraints, consumed owner-specific observers/events, and physical persistence-plan rewriting. Retain the complete mandatory Runtime order and logical intent; protected constraints never enter replaceable physical state. |
| P-016         | Current adapter support, contribution/raw-access and migration boundaries remain owner- and privilege-checked. Database-specific logic stays with its adapter; requests cannot acquire an unleased driver or bypass transactions.                                                    |
| P-017         | Transport metadata and Core request execution. Transports receive only the required immutable plan and narrow execution allowlist, never engines, adapters, authority grants, or lifecycle control.                                                                                  |
| P-018         | Typed committed events and owner-specific consumers. Business after-hooks remain pre-commit and can abort; delivery after commit cannot change the transaction outcome.                                                                                                              |
| P-019         | Consumed nominal public type references plus graph-derived declarations. Fingerprints remain deterministic; generated files never become executable Runtime truth.                                                                                                                   |
| P-020–P-021   | Audited internal elevation, neutral principal/role resolution, and reference cleanup. Subjects grant nothing themselves; forged/foreign/stale authority fails and an audit failure cannot grant elevation.                                                                           |
| P-022–P-023   | Manifest/privilege diagnostics, safe owner inspection, immutable compiled setup views, and declared plugin exports. Denied privileges fail before static declaration, setup, Typegen, or infrastructure effects.                                                                     |

No concrete plugin name or permission enters Core. Access remains independent
of ACL and Soft Delete. `anonymous` and `master` remain the only Core authority
modes. Native Query/CRUD, relations, nested writes, virtual fields, validation,
and transactions are retained; this decision is not a redesign of their AST.

## One private compiled command graph

Compile one closed discriminated graph for the two retained command kinds:

- application operation: owner-controlled input/result, declared public errors,
  and its existing `required`, `optional`, or `forbidden` transaction policy;
- schema mutation: frozen schema targets and surface aliases, payload contract,
  request or Master authority, dependency selection, owner-only effect, and
  before/after materialization through the canonical mutation pipeline.

Private Master administration is the second kind with `authority: master`,
not another extensible family. It rejects non-Master requests before target
lookup and remains absent from public REST and GraphQL. Application operations
do not gain item-policy/mutation semantics merely by sharing storage with
schema mutations.

The graph contains only facts required by an existing execution invariant or
two current projections. It is private Core state, not a public dictionary,
service locator, named registry, or plugin-owned metadata bag.

| Canonical fact                                                               | Current consumers or invariant                                                                |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Nominal identity, name/version, structured owner and contribution provenance | Runtime binding, surface collision checks, transport plans, and deterministic Typegen         |
| Command discriminant, target, and frozen surface names                       | Correct dispatch and authority; direct handles, Typegen, REST, GraphQL                        |
| Authority and transaction semantics                                          | Core entry validation and logical execution; inert projections report only facts they need    |
| Validated input/result facts and public errors                               | Runtime snapshots and public-safe failures; Typegen and transport declarations                |
| Mutation effect, returning phase, and private dependency selection           | Owner-only physical writes and correct result materialization; mutation planning where needed |
| Nominal type references                                                      | Derive direct handles and generated application declarations without executable output        |
| Canonical protocol identity and inert transport metadata                     | Compile the public transport shape and bind the matching execution allowlist                  |
| Private owner-bound implementation reference                                 | Prevent declaration/handler/codec identity drift and invoke the exact attributed callback     |

A plugin's credentials, state machine, SQL, validation implementation, and
one-consumer private configuration stay with the plugin. Do not copy them into
the graph for hypothetical consumers. Do not add a general command plugin API
or force native CRUD into this graph.

Static compilation owns final identity and inert facts and publishes
atomically. Callback-free projections never expose input validators, handlers,
wire codecs, constructors, grants, adapters, or mutable stores. Source tokens
and application-lifetime provider factories retain private execution references;
materialization resolves each exact reference once under the same owner. It
cannot mutate compiled facts or add a second independently validated registry.
Failure cleans up the resources already materialized.

Surfaces, Typegen, and transport plans derive read-only projections. Immutable
indexes or cached views may reference canonical records for lookup; they cannot
own independent declarations or accept registrations. The Runtime view may
resolve only the private execution reference required for its command. Public
transport execution still enters the existing Core application request
capability. Static plans and late-bound facades derive the same records while
retaining their distinct lifecycle and authority boundaries.

## Reduction and migration order

| Concern                                   | Baseline                                                                                          | Accepted target                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Extension powers selected here            | Ten mechanisms with implementations/exports/tests                                                 | Removed, including the explicit public-probe exception                             |
| Named capability tokens in this inventory | 39                                                                                                | 36 after C-034/C-036/C-037 removal; no new substitute token                        |
| Manual Typegen levels                     | Reference, contribute, emit                                                                       | Consumed references only                                                           |
| Arbitrary operation targets               | Application, schema, model                                                                        | Application; actual schema mutations retain schema/model surfaces                  |
| Command authority stores                  | Operation and mutation maps, surface registries, Runtime handler/binding maps, transport planners | One private graph, private execution binding, and derived immutable views          |
| Public authoring                          | Retained factories plus unused extension families                                                 | Retained factories minus exact removed families; no public generic graph registrar |

The [baseline](../plans/2026-09-20-architecture-simplification-baseline.md)
measured 1,174 Core exports and source references across 21 operation-definition,
8 handler, 11 transport-plan, 16 mutation-definition, 7 mutation-surface,
5 mutation-handler, and 7 mutation-plan production files. These are baseline
measurements, not promised final file counts. Issues 3004/3005 and 3014 must
measure actual export, line, test, and time deltas.

For a change to an operation's public errors, target or type facts, the target
is one canonical compilation change with projection consumers, instead of
editing separate copies in surface compilation, dispatcher setup, Typegen
snapshot, and static/late transport binding. Protocol-specific codecs and
REST/GraphQL schemas keep their legitimate owning files. A reduced count must
come from deleting duplicate state, not moving it to a broader registry.

1. Issue 3004 removes R-001–R-004 and R-009. Keep the canonical compiler and
   Runtime direct and move performance instrumentation before deleting its API.
2. Issue 3005 removes R-005–R-008 and R-010, including obsolete Typegen,
   schema/model command, and destructive-patch branches.
3. Issues 3006/3007 implement ADR-0258 without a test-only activation bypass.
4. Issue 3008 compiles the private graph and proves ownership/projection
   invariants. Existing public retained authoring inputs may adapt into it only
   for the bounded migration; no new public authoring abstraction is implied.
5. Issues 3009/3010 migrate application operations and schema mutations. Delete
   each old Runtime store when its last consumer moves.
6. Issue 3011 derives direct and Typegen surfaces; issue 3012 derives both
   transport projections and their matching execution facades. Delete replaced
   surface/planning state in the issue that removes its last consumer.
7. Issue 3013 audits absence of every superseded path and reconciles equivalent
   test coverage. Issue 3014 runs the Core checkpoint and ends this authorized
   run before issue 3015.

Each issue requires its fix/audit loop and dedicated local commit. A new actual
consumer, security regression, unapproved observable loss, or need for a new
public abstraction reopens this decision before crossing that boundary.

## Documentation and compatibility

These are explicit pre-1.0 public removals, not compatibility-preserving aliases.
Current implementation and public website documentation stay authoritative
until each implementation issue lands. That issue must update affected package
READMEs, examples, built-export/type tests, and
`apps/website/content/docs` together. The later documentation reconciliation
issues do not postpone this obligation.

Older ADRs retain their historical text. This record supersedes only the
replacement/decorator, destructive transformation, generic observer,
schema/model arbitrary-operation, query-extension, and extra Typegen powers
identified above. Their other ownership, security, declaration, transaction,
and plugin-neutrality decisions remain in force.
