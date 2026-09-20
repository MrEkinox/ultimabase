# Issue 3003: reviewed smaller-kernel decision and audit

- Status: user decisions accepted in [ADR-0259](../adr/0259-smaller-plugin-kernel-and-canonical-commands.md)
- Source checkpoint: `481b3723`
- Issue: [3003](../../issues/3000-pre-feature-architecture-simplification/3003-smaller-plugin-kernel-decision.md)
- Implementation: none in issue 3003; scheduled in 3004/3005 and 3008–3013

## Retained contract

The [baseline matrix](2026-09-20-architecture-contract-matrix.md) remains the
complete retained inventory (B-001 through B-012, P-001 through P-023, and
C-001 through C-039), except approved D-001, approved R-001 through R-007, and approved R-008 through R-010 from the additional audit findings. This proposal does not authorize deleting other capabilities.

Preserve schemas/fields/options, immutable patches, schema/model-bound schema mutations,
application operations, target-aware schema mutations, private storage,
capability provision/requirements and their single/multiple/pipeline
cardinalities, explicit plugin instances, deterministic dependency order,
resource cleanup, middleware, monotonic constraints, observers, persistence
rewrites, adapter contributions, migration intent, events, transport metadata,
and nominal Typegen references, audited elevation, neutral principal/role
protocols, privilege diagnostics, and compiled setup projections. All authority, transaction, validation,
callback-attribution, cancellation, and least-authority boundaries remain.
Hooks, Access, ACL, Roles, Validation, Password Auth, Soft Delete, PostgreSQL,
pg-vector, HTTP, Hono, REST, GraphQL, Yoga, and explorers keep their behavior
outside D-001. No official plugin receives a private replacement mechanism.

## User-approved removal rule

On 2026-09-20, after reviewing the list below, the user confirmed that a
capability with no concrete current use should be removed and added back only
when needed. Its own implementation, public exports, documentation,
illustrative examples, and self-testing fixtures do not establish a concrete
consumer. Do not retain a compatibility wrapper or invent a new abstraction
solely to preserve an unused extension power.

This selects R-001, R-003, R-005, R-006, and R-007 for removal, subject to the
final issue 3003 audit and accepted ADR. The user then explicitly approved
removing the public performance-probe API while retaining equivalent internal
measurements, which also authorizes R-002 and R-004. The seven listed public
API losses are part of the decision, not a reason to request approval again.
Actual applications, plugins, generated projects, engineering tools, and
security/lifecycle invariants remain preservation obligations. The performance
probe is a real consumer, not merely a fixture testing executor replacement
for its own sake; its used-API exception is explicit and preserves the measured
invariant. The user subsequently approved A-001 through A-003 as R-008 through R-010.
ADR-0259 records the accepted target; implementation remains in later issues.

## Exact removal inventory

These powers have public exports, tests, documentation, and community-authoring
promises. No external plugin census is available. “No official consumer” does
not mean “no public compatibility impact.” The selected removals must include
the public export and website updates described below. A newly discovered
actual consumer reopens the decision; a hypothetical external consumer alone
does not justify retaining an otherwise unused power.

| Baseline ID | Power proposed for removal                                                              | Current repository evidence                                                                               | Observable difference                                                                                                                                          |
| ----------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-001       | `decorateCapability` and `capability:decorate`                                          | No official production caller.                                                                            | Plugins can no longer wrap arbitrary capability providers through the generic decorator API. Ordinary middleware and composed providers remain.                |
| R-002       | `replaceCapability` and `capability:replace`                                            | Production calls are Core's specialized compiler/Runtime wrappers.                                        | Plugins can no longer replace another capability provider through this generic contract.                                                                       |
| R-003       | `replaceSchemaCompiler`, `schema:replace`, and the public compiler-replacement protocol | No official consumer outside its Core machinery.                                                          | Compilation uses the canonical Core compiler; schema/field contributions and immutable transformations remain.                                                 |
| R-004       | `replaceRuntime`, `runtime:replace`, and the public executor-replacement protocol       | `RuntimeCostProbe` is an actual public testing-package consumer.                                          | Execution uses the canonical Runtime. The user explicitly approved removing the public probe API while retaining equivalent internal performance measurements. |
| R-005       | Query extension registration and `query:extend`                                         | No official production caller of `defineQueryExtension`; public examples/type/conformance fixtures exist. | Plugins lose this mechanism for adding custom QueryBuilder factories. Ordinary Query, filters, operations, schema mutations, and model commands remain.        |
| R-006       | Manual structured main-output Typegen contributions and `typegen:contribute`            | No official production plugin invokes the power.                                                          | Plugins cannot append arbitrary structured declarations to the main output. Graph-derived types and consumed nominal references remain.                        |
| R-007       | Owned additional Typegen outputs and `typegen:emit`                                     | No official production plugin invokes the power.                                                          | Plugins cannot ask Typegen to emit extra declaration/metadata files. Normal application declaration generation remains.                                        |

Each removal includes the corresponding exports, privileges, factory/registrar
types, declaration branches, protocol tokens used only by the removed power,
inspection metadata, docs, and obsolete fixtures. It does not include behavior
validation currently enforced by that machinery. In particular, compiler output
integrity and Runtime authority/transaction protection must remain enforced.
C-034 and C-037 would cease to be public replaceable-provider protocols; their
canonical execution/compilation behavior remains a direct Core responsibility.
The approved removal explicitly revises their baseline “retain token” proposal.

## Approved migration of the actual performance consumer

[`RuntimeCostProbe`](../../packages/testing/src/performance/runtime-cost-probe.ts)
uses `replaceRuntime()` to count assembled optional bundles/stages and actual
stage invocations. The [Testing README](../../packages/testing/README.md)
documents it; `src/index.ts`, `tests/public-api.test.ts`, and its type test
protect the exports. The repository consumer is
[`runtime-cost-scenario.ts`](../../tests/performance/fixtures/runtime-cost-scenario.ts),
called by
[`no-product-runtime-cost.performance.test.ts`](../../tests/performance/no-product-runtime-cost.performance.test.ts).
These tests protect the current no-neutral-stage invariant, so neither their
measurements nor their assertions may simply be deleted.

The user approved moving this measurement instrumentation into Core-owned test
fixtures, instrumenting the actual canonical assembly and executed stages in
tests. Keep the same four scenarios, startup and request counts, and database
work assertions. Remove the public Testing exports `RuntimeCostProbe`,
`RuntimeCostProbeOptions`, `RuntimeCostSnapshot`, `diffRuntimeCostSnapshots`,
and `assertNoOptionalRuntimeCost` as the explicitly approved exception. Do not
add a public metrics capability, Core test switch, privileged escape hatch, or
production stage when the product engine is absent. The implementation must
prove equivalent measurement coverage before removing the existing test path.

The alternative of retaining R-004 and its R-002 machinery was not selected.

If the internal measurement approach cannot prove the same invariant without
new production/public machinery, stop again rather than replacing the evidence
with narrower tests or introducing a new API silently.

## Retained-inventory audit findings

Applying the user's concrete-use rule uncovered incorrect consumer attribution
in the baseline retained inventory. The user explicitly approved all three additional removals. They extend the
seven initial rows as R-008 through R-010; their distinct retained paths are
recorded below and in ADR-0259.

| Finding | Existing retention claim                                                                             | Verified source evidence                                                                                                                                                                                                                                                                                                                                                                                                         | Approved bounded change                                                                                                                                                                                                                                                     |
| ------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-001   | P-003 treats destructive `schema:transform` patches as used by Soft Delete.                          | Soft Delete requests `schema:declare` and adds its tombstone through additive patches. No concrete production plugin, runnable example, or tooling caller of destructive field/index patch factories was found; replacement/rename/removal appears in the mechanism's implementation, tests, and illustrative documentation.                                                                                                     | Remove destructive patch extension paths and `schema:transform`; preserve additive schema/field/index/constraint contributions and every currently used option patch. Inventory all factories and retained validation before implementation.                                |
| A-002   | P-014 / C-036 treat Hooks and Access diagnostics as consumers of Core's `runtimeObserverCapability`. | Hooks events use `hookEventContributionsCapability`; Access diagnostics use `accessDiagnosticsObserverCapability`. `provideRuntimeObserver` / generic `postCommitEvent` consumers found are conformance and capability fixtures, not these product implementations.                                                                                                                                                              | Remove only the generic Core observer path (R-009). Retain `runtime:observe`, the actual Hooks/Access capabilities, existing post-commit delivery, and ordering/rollback guarantees.                                                                                        |
| A-003   | P-005 / P-006 attribute arbitrary schema/model operation commands to Password Auth.                  | Password Auth's four `defineOperation` calls and the runnable minimal status operation all target `application`. `AppUser.signUp/login/refresh/logout` use the plugin's schema factory methods. Soft Delete uses the separate, actually consumed `schemaMutations` map. Generic `schemaCommands` / `modelCommands` consumers found are self-testing or illustrative fixtures and their Typegen/conformance projection machinery. | Remove arbitrary operation targets `schema` / `model` and their command maps while retaining application operations, Password Auth methods, and schema/model-bound schema mutations. R-010 narrows the command graph to application operations and actual schema mutations. |

Source anchors: [Soft Delete plugin](../../packages/soft-delete-plugin/src/plugin.ts),
[Password Auth operations](../../packages/password-auth-plugin/src/operations.ts),
[Password Auth methods](../../packages/password-auth-plugin/src/user-auth-methods.ts),
[runnable status operation](../../examples/minimal/src/status-plugin.ts),
[Core observer carrier](../../packages/core/src/runtime/capabilities.ts),
[Core observer assembly](../../packages/core/src/runtime/contributions/composition.ts),
[Hooks event carrier](../../packages/hooks-plugin/src/runtime/events.ts),
[Access diagnostics](../../packages/access-plugin/src/runtime/diagnostics.ts),
and [schema patch factories](../../packages/core/src/plugins/schema-field-patch-operations.ts).

These findings do not authorize dropping a security check because its extension
path disappears. The proposed result is less authoring machinery with the same
used plugin and product behavior. They do not reopen the approved R-001 through R-007 decision or justify a new
metrics API. A-001 maps to R-008/3005, A-002 to R-009/3004, and A-003 to
R-010/3005.

## Canonical command graph direction

Keep application operations and schema mutations as distinct discriminants.
The internal compiled graph owns exact identity/owner, target, authority,
input/result facts, private handler reference, surface bindings, retained type
facts, and references to transport bindings. Private one-consumer implementation
details remain with their owner. No generic public contribution dictionary or
new operation family is introduced.

Today declaration stores, operation/schema-mutation surface registries, Typegen
snapshots, and transport planning/execution bindings carry overlapping command
facts. The target compiles those facts once and derives immutable projections
for handles, Typegen, REST, GraphQL, and Runtime. Inert projections reveal no
handler, adapter, grant, or application lifecycle control. Consolidating facts
does not merge application-operation transaction semantics, target-aware schema
mutations, or private Master administration.

ADR-0259 fixes this direction and the exact migration map below. Issue 3003
requires a green documentation and boundary audit before its dedicated commit.
Issue 3004 then removes approved replacement and generic-observer machinery, issue 3005 removes
only approved declaration/Typegen powers, and 3008–3013 migrate the graph and
delete superseded paths. No compatibility registry remains as a second source
of truth. Public changes update the actual website pages in their implementation
issue, not only READMEs.

## Production plugin and transport parity audit

The decision changes no product implementation. These sixteen package entry
points remain on the same retained kernel boundaries; none declares or calls
R-001 through R-010 for its product behavior. The actual public testing-package
consumer of R-004 is the explicit exception described above. The source scan
also covers runnable examples and tooling; the minimal status operation uses
an application target and remains supported.

| Package and source entry                                                   | Retained execution and projection path                                                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [Access](../../packages/access-plugin/src/plugin.ts)                       | Option compilation, exact schema-mutation keys, monotonic policy and its own diagnostics capability                                        |
| [Hooks](../../packages/hooks-plugin/src/plugin.ts)                         | Option compilation, behavior stages, schema-mutation keys, transaction journal, own diagnostics/events                                     |
| [Validation](../../packages/validation-plugin/src/plugin.ts)               | Contextual field option and final rejection-only mutation guard                                                                            |
| [Roles](../../packages/roles-plugin/src/plugin.ts)                         | Role subjects, persistence behavior, audited elevation and committed events                                                                |
| [ACL](../../packages/acl-permissions-plugin/src/plugin.ts)                 | Generic protected constraints, prepared-operation transforms, neutral subject resolution, cleanup and committed events                     |
| [Password Auth](../../packages/password-auth-plugin/src/plugin.ts)         | Application operations, private storage, factory-owned User methods, neutral principal resolver and HTTP context/routes                    |
| [Soft Delete](../../packages/soft-delete-plugin/src/plugin.ts)             | Additive tombstone, protected visibility, physical delete rewrite, actual schema mutations and private Master administration               |
| [PostgreSQL](../../packages/postgres-plugin/src/plugin/postgres-plugin.ts) | Adapter capability, owned/borrowed connections, transactional persistence, retained adapter bridges and private storage                    |
| [pg-vector](../../packages/pg-vector-plugin/src/index.ts)                  | Contextual field definition, value snapshot, wire codec and nominal type references; this does not claim a physical-schema bridge consumer |
| [HTTP](../../packages/http-plugin/src/plugin.ts)                           | Endpoint/context composition, application request capability, safe pre-dispatch errors and explicit audited Master handling                |
| [Hono](../../packages/server-hono-plugin/src/plugin.ts)                    | HTTP application and server lifecycle under ADR-0258; no operation execution bypass                                                        |
| [REST](../../packages/rest-plugin/src/plugin.ts)                           | Retained schema routes and application-operation/schema-mutation plans; narrow request execution and existing envelopes                    |
| [GraphQL](../../packages/graphql-plugin/src/plugin.ts)                     | Static schema composition and inert command plans; network-independent request execution and existing errors                               |
| [Yoga](../../packages/graphql-yoga-plugin/src/plugin.ts)                   | GraphQL application, HTTP endpoint and endpoint description capabilities                                                                   |
| [GraphiQL](../../packages/graphiql-plugin/src/plugin.ts)                   | HTTP explorer endpoint and selected GraphQL endpoint description                                                                           |
| [Apollo Sandbox](../../packages/apollo-sandbox-plugin/src/plugin.ts)       | HTTP explorer endpoint and selected GraphQL endpoint description                                                                           |

Typegen continues to derive application and schema-mutation declarations and
consumed nominal references. Plugin Kit remains a public authoring helper and
cannot hide removed Core powers. Testing retains conformance and database
isolation; the cost-probe API removal moves its assertions into internal tests.
The remaining B/P/C matrix contracts are not silently widened or removed.

## Audit loop

1. The initial inventory named only R-001–R-007 and misattributed three retained
   consumers. Source inspection found A-001–A-003; the issue stopped, presented
   the exact losses and preserved paths, and obtained the user's approval.
2. The revised decision assigns R-009 to 3004 and R-008/R-010 to 3005, keeps
   `runtime:observe`, distinguishes actual schema mutations from arbitrary
   schema/model operations, and removes the misleading pg-vector bridge claim.
3. The architecture review retained compiler integrity checks and actual
   performance measurements without either replacement protocol. Shared inert
   types may remain only for an actual retained consumer. No new metrics token,
   production test switch, private official path, or generic graph registrar is
   accepted.
4. The graph review preserves static compilation versus resource materialization
   and inert planning versus narrow request execution. It limits compiled facts
   to current invariants or shared projections, names the removal issue for each
   old store, and leaves owner-private facts local.
5. The documentation review keeps current public website and package claims
   unchanged until the matching implementation; 3004/3005 must update them in
   the same change. Root instructions identify the accepted future target so
   old architecture text is not mistaken for a new approval requirement.

The final issue handoff records validation results. Acceptance of this decision
is not evidence that a later implementation already passes behavior parity.
