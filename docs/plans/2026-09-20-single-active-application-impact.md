# Issue 3002: proposed single-active-application compatibility decision

- Status: approved on 2026-09-20; decision recorded in ADR-0258
- Source checkpoint: `b2c10fc2`
- Issue: [3002](../../issues/3000-pre-feature-architecture-simplification/3002-single-active-application-decision.md)
- Implementation: none
- Accepted decision: [ADR-0258](../adr/0258-single-active-application-lifecycle.md)

## Why this decision needs approval

The milestone preserves used product and plugin capabilities by default.
Concurrent applications in one process are an existing documented and tested
contract. Removing them is an explicit compatibility exception, not removal of
unused infrastructure. The repository cannot establish whether external
community integrations depend on this contract.

## Current evidence and proposed disposition

| Current contract and evidence                                                                                                                                                                                                                                                                                                                                  | Proposed disposition                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ADR-0050](../adr/0050-isolated-framework-application.md) and the [Core README](../../packages/core/README.md) allow independent initialized and running applications in one process.                                                                                                                                                                          | Only one initialized application may own live plugin resources in a JavaScript realm. Multiple inert definitions may still be constructed and compiled.                                                                                                                          |
| [ADR-0197](../adr/0197-application-local-schema-handle-surfaces.md) permits different handle surfaces for the same schema class in separate applications.                                                                                                                                                                                                      | Preserve pure independent compilation and sequential reuse after disposal. Concurrent execution moves to isolated workers or processes. Never mutate a shared schema class or prototype to install an application's state.                                                       |
| [Password User E2E](../../packages/password-auth-plugin/tests/e2e/password-user-methods.postgres.e2e.test.ts) starts two applications sharing a User class, uses the same username independently, and rejects foreign tokens.                                                                                                                                  | Replace the concurrent same-realm case with sequential replacement and isolated-worker coverage. Preserve foreign-token rejection and concurrent requests within one application.                                                                                                |
| [Hono README](../../packages/server-hono-plugin/README.md), the [website Hono page](../../apps/website/content/docs/1.0.0/plugins/official/hono-server.mdx), and [provider tests](../../packages/server-hono-plugin/src/provider.test.ts) promise one listener shared by several applications, independent unmounting, unique IDs, and equal browser policies. | Remove multi-application listener sharing, application sets, cross-application CORS comparisons, and last-mount shutdown rules. Preserve managed listener ownership and developer-owned Hono integration for one UltimaBase application.                                         |
| [HTTP README](../../packages/http-plugin/README.md) documents the exported `HttpApplicationMountTable` used by server authors. Its public export is in [index.ts](../../packages/http-plugin/src/index.ts).                                                                                                                                                    | Remove this multi-application authoring API. Server providers consume one existing `HttpApplication` capability. Its request boundary must retain protocol compatibility, original-header checks, bootstrap handling, and safe errors. This is a public plugin-author API break. |
| [REST public vertical](../../tests/e2e/rest-public-vertical.postgres.e2e.test.ts) starts several applications using one shared server.                                                                                                                                                                                                                         | Remove the intentionally retired routing scenario; preserve resource, credential, and error assertions using sequential applications or isolated processes as appropriate.                                                                                                       |
| [Core application website page](../../apps/website/content/docs/1.0.0/core/application.mdx) documents independent disposal with shared providers.                                                                                                                                                                                                              | Update this and the HTTP/Hono journeys with the implementation issues. Package READMEs alone do not satisfy the website requirement.                                                                                                                                             |
| [Root Vitest configuration](../../vitest.config.ts) and [package configuration](../../tooling/vitest/package.config.ts) use process forks with file parallelism.                                                                                                                                                                                               | Preserve parallel files/workers. Several active applications inside one worker must become sequential or use separate workers. Parallel requests against one application remain supported.                                                                                       |

This evidence establishes real compatibility losses. The user approved
alternative 1 below and confirmed separate production processes/containers and
isolated parallel test workers. The expanded audit below maps current consumers
to the accepted decision. Implementation and its regression verification remain
owned by issues 3006 and 3007.

## Recommended lifecycle boundary

- Construction and pure schema compilation stay local and may coexist. Typegen
  application identity continues to identify its compiled graph and artifacts.
- The exclusive application slot is acquired when initialization begins,
  before application capability materialization and plugin setup.
  `UltimaBase.start()` already initializes first. The lower-level
  `createApplication()` also initializes, so creating a second initialized
  application would now fail even if neither listener has started.
- This earlier boundary is deliberate: [initialization](../../packages/core/src/application/framework-application.ts)
  materializes application-lifetime capabilities. Restricting only listeners
  would leave multiple live application resource owners.
- Repeated initialization/start on the same owner remains idempotent according
  to the existing lifecycle. A second owner fails before its resource effects.
- `stop()` stops infrastructure but retains setup-owned resources and the
  exclusive slot. As today, a stopped application cannot be restarted.
- Complete `dispose()` releases the slot. A later application can use different
  schemas/plugins and must not inherit old handles, request authority, callbacks,
  or resources. Repeated disposal is safe and must never release a newer owner.
- Failed initialization/start cleans up its owner before releasing the slot.
  A cleanup failure is surfaced; replacement must not silently proceed while
  the previous owner's resources may remain live.
- Each isolated JavaScript worker/process has its own slot. No shared pool,
  global schema registry, process-wide user, or mutable current request is added.

The exclusivity slot is a lifecycle guard. Execution retains explicit
application handles and `{ ultimabase }` outside request scopes; inside a
request it uses that request's owner. A conflicting explicit owner fails.
There is no new implicit default-application execution API. Old handles and
contexts must fail after disposal instead of rebinding to the next application.
Concurrent requests retain separate transactions, subjects, cancellation,
callbacks, and Master provenance.

## Recommended HTTP boundary

Keep `httpPlugin({ appId })`, `X-UltimaBase-Application-Id`, the existing browser
bootstrap URLs, and their rejection behavior. They identify the expected sole
application rather than selecting from an application map. The ID remains
public and grants no authority. No REST/GraphQL resource URL or payload change
is required by this decision.

Keep raw Master validation, session resolution, original-header evidence,
application-bound contexts, route collision checks, safe pre-dispatch errors,
deadlines, and infrastructure-only browser preflight. An external Hono app may
still host ordinary developer routes alongside its one UltimaBase application.

Multi-application hosting moves to separate workers/processes and, when one
public address is needed, deployment-owned routing. This milestone does not
introduce a worker manager or replacement routing service.

## Alternatives and impact

1. **Recommended:** approve the lifecycle and HTTP boundaries above. This removes
   concurrent application ownership and shared-server routing while preserving
   ordinary request/transport behavior and parallel test workers. It explicitly
   breaks concurrent initialization/hosting and the mount-table authoring API.
2. **Keep concurrent applications:** retain these public capabilities and revise
   issues 3006/3007 accordingly. Other approved simplifications can still proceed,
   but lifecycle and shared-server machinery cannot simply be deleted.
3. **Also remove HTTP application identity:** remove `appId`, the required header,
   and revise bootstrap/error contracts. This is an additional public protocol
   change affecting clients and many examples; it is not recommended as a
   consequence of reducing application concurrency alone.

The user selected alternative 1 with “Validé” on 2026-09-20, then confirmed the
deployment rationale. ADR-0258 formalizes that exact compatibility exception.
Alternatives 2 and 3 were not selected. No Runtime code changes in issue 3002.

## Expanded decision audit

The audit searched application creation/initialization/start sites, parallel
activation, multi-application test names, shared listeners/mount tables, and
public isolation claims across `packages`, `tests`, `examples`, root documents,
ADRs, concepts, and website MDX. Test names alone are not activation evidence:
pure compilation, fake HTTP values, and several requests in one application
have different dispositions from two live application owners.

### Core ownership, execution, and compilation

- `packages/core/src/application/optional-access-principals.test.ts`,
  `plugins/capability-composition.test.ts`, `plugins/constraint-compilers.test.ts`,
  `runtime/behaviors/composition.test.ts`, and `runtime/capabilities.test.ts`
  compare separately initialized resources. Preserve their provenance,
  immutability, order, and disposal assertions in sequential lifetimes; test
  competing initialization separately. The shortened paths in this section
  are relative to `packages/core/src`.
- `runtime/application/ultima-base.test.ts`,
  `runtime/application/application-request-execution.test.ts`,
  `runtime/context/current-ultima-base.test.ts`,
  `runtime/context/active-framework-context.test.ts`, and
  `runtime/engine/framework-engine.test.ts` cover explicit/ambient selection,
  nested asynchronous scopes, transactions, and foreign Master/context input.
  Retain concurrent requests and nested scopes within one owner. Preserve
  foreign and stale provenance checks across sequential owners instead of
  deleting them with successful concurrent activation.
- `runtime/plugin-operations/runtime.test.ts` and
  `runtime/plugin-operations/transport-protection-diagnostics.test.ts` cover
  bound models/handles and application-specific protection reports. Dispose the
  first owner before starting the next; prove old handles remain unusable and
  new reports do not inherit old diagnostics. The relation-filter lifetime
  test in `runtime/relation-filters/execution.test.ts` already checks one
  disposed owner and remains required.
- `plugins/application-surfaces.test.ts`, `plugins/declaration-host.test.ts`,
  `plugins/schema-compiler-ir/schema-compiler-capability.test.ts`,
  `plugins/schema-declaration-registry.test.ts`,
  `schema/schema/compilation.test.ts`,
  `schema/schema/plugin-field-builder-methods.test.ts`, and
  `query/filters/relation-where-declaration.test.ts` protect independent graph
  compilation and stable schema identity. Pure snapshots may coexist; cases
  currently using `createApplication()`/`initialize()` must dispose sequentially
  or use their existing pure compilation boundary when no resource is needed.
  No compilation assertion is retired by D-001.
- `packages/core/tests/e2e/virtual-fields-postgres.postgres.e2e.test.ts` retains
  private dependency isolation across lifetimes and worker-owned databases.
  Its fixture must not start a second owner while the suite fixture is active.

### Product behavior and plugin conformance

- Access's `src/plugin.test.ts` and `src/schema-mutation-access.test.ts`, Hooks'
  `src/schema-mutation-hooks.test.ts`, Soft Delete's `src/plugin.test.ts`, and
  Roles' `src/role-schema.test.ts` retain all permission, callback, tombstone,
  option-default, and role-domain assertions. Run initialized variants
  sequentially. Pure option/provenance comparisons remain independent.
- `packages/validation-plugin/src/standard-schema-libraries.test.ts` and
  `packages/typegen/src/plugin-field-containment-isolation.test.ts` compare
  pure compilation. Preserve these and Typegen generator/loader determinism
  without introducing runtime activation or merging application outputs.
- Password Auth's `password-user-methods.postgres.e2e.test.ts`,
  `password-sessions-postgres.postgres.e2e.test.ts`, and
  `password-http-sessions.postgres.e2e.test.ts` under its `tests/e2e` retain
  foreign-token, exact User, ambient-owner, session rotation, and credential
  checks. Start independent database-backed owners sequentially or in workers.
  Database-backed session lifetime is not changed by process replacement.
- `packages/acl-permissions-plugin/tests/e2e/acl-reference-cleanup-postgres.postgres.e2e.test.ts`
  retains application-private cleanup contributions and transaction rollback;
  isolate or sequence the second application fixture.
- `packages/testing/src/plugins/runner.ts` currently initializes two owners
  together for its public `application-isolation` check. Preserve that check's
  name and isolation goal with sequential replacement plus competing-owner
  rejection. Keep pure static-determinism comparisons and two explicit plugin
  instances within one graph. The context's automatic cleanup must still run
  after failed checks, and a verifier must dispose one owner before starting
  another. `packages/testing/src/plugins/conformance.test.ts` and
  `packages/hooks-plugin/tests/e2e/official-hooks-conformance.e2e.test.ts`
  must exercise that contract.
- Cross-package `tests/e2e/open-kernel-proof.e2e.test.ts`,
  `optional-hooks-engines.e2e.test.ts`, `alternative-policy-engine.e2e.test.ts`,
  and `access-provider-composition.e2e.test.ts` retain official/community
  engine parity, deny-only policy, Master, privileges, and cleanup. Their
  fixture schedules change; their plugin capabilities do not.
- `tests/performance/no-product-runtime-cost.performance.test.ts` currently
  starts four scenario applications through `Promise.all`. Run scenarios
  sequentially and retain identical structural work budgets. Record this
  scheduling difference when comparing wall-clock performance with the baseline.

### HTTP and public verticals

- `packages/http-plugin/src/mount-table.test.ts` retires successful
  multi-application routing/table composition. Its original-header, protocol,
  safe-error, exact bootstrap, and ownership assertions migrate to the sole
  application boundary. `src/application.test.ts` and
  `src/context-and-master.test.ts` retain disposed-graph rejection, request
  concurrency, attribution, deadlines, and exact Master/session behavior.
- `packages/server-hono-plugin/src/provider.test.ts` and `src/plugin.test.ts`
  retire same-provider multi-application sharing, duplicate-app-ID mounting,
  cross-application policy comparisons, and last-mount teardown. Preserve
  listener failure cleanup, graceful responses, external ownership, raw
  headers, CORS, repeated lifecycle calls, and normal socket conflicts. Tests
  using inert fake HTTP values must not be confused with multiple Core runtimes.
- `packages/graphql-plugin/src/compiler.test.ts` and
  `src/networkless-execution.test.ts` retain schema/owner isolation and execute
  initialized applications sequentially. `packages/graphql-yoga-plugin/src/hono.test.ts`
  replaces its shared-Hono scenario while retaining ordinary Yoga integration.
- `packages/rest-plugin/src/routes.test.ts` and `src/read-execution.test.ts`
  retain provenance, sparse configuration, dynamic schema freshness, and exact
  request selection; separate initialized owners sequentially.
- `tests/e2e/rest-public-vertical.postgres.e2e.test.ts`,
  `authenticated-rest-vertical.postgres.e2e.test.ts`, and
  `graphql-explorer-plugins.e2e.test.ts` retire shared-application hosting only.
  Preserve resource parity, cookies/Bearer, Master, CORS, foreign IDs,
  bootstrap-path rejection, and private explorer configuration in each owner.
  Do not replace these with only a test that second startup fails.

### Public and historical claims

- Issue 3006 updates the Core and Testing READMEs, website
  `core/application.mdx`, `guides/test-an-application.mdx`, and plugin-author
  `index.mdx` / `runtime-and-infrastructure.mdx`. The latter explicitly asks
  authors to test two applications in parallel and must instead explain worker
  isolation and sequential replacement. Typegen's multi-application repository
  configuration stays supported; it does not promise concurrent runtimes.
- Issue 3007 updates the HTTP/Hono READMEs and website official HTTP/Hono pages,
  the root README/architecture, and `docs/concepts/transports.md`. Other HTTP,
  REST, GraphQL, explorer, auth, and Soft Delete examples keep their `appId`,
  header, bootstrap, and resource protocol. Source metadata and the website
  documentation ownership map guide the full page review at implementation.
- ADRs 0048, 0050, 0066, 0075, 0197, 0201, 0224, 0226, 0248, and 0254 contain
  historical concurrent-application assumptions. ADR-0258 replaces only those
  assumptions, preserving their remaining security, ownership, request-scope,
  and plugin-instance guarantees. Already superseded registry APIs do not
  become supported again. Older ADR prose is not rewritten.

## Audit corrections and outcome

The initial proposal named the main HTTP and Password Auth consumers but did
not yet account for the conformance harness, low-level engine entry points,
static mutation-name accumulation, plugin-author website guidance, or parallel
performance fixtures. This audit added their explicit dispositions to ADR-0258
and this inventory. It also distinguished persistent session credentials from
in-memory stale authority, preventing an unintended logout-on-restart change.

The second decision review found no unresolved behavior difference outside
approved D-001. All other plugin and product contracts remain retained. The
implementation issues must rescan actual activation sites and run their full
regression gates; this documentation audit does not claim those migrations or
their tests have already passed.
