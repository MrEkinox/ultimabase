# ADR-0258: One active application per JavaScript realm

- Status: accepted
- Date: 2026-09-20
- Supersedes: ADR-0050 concurrent initialized applications; ADR-0197 concurrent execution only; ADR-0224 shared-server application selection; ADR-0226 cross-application browser-policy composition; ADR-0248 accumulated cross-application static method visibility
- Refines: ADR-0049, ADR-0066, ADR-0071, ADR-0190, ADR-0201, ADR-0225, ADR-0241, ADR-0254
- Implementation: issues 3006 and 3007; this decision does not change Runtime
- Evidence: [compatibility and test audit](../plans/2026-09-20-single-active-application-impact.md)

## Context and approval

The original isolation contract supports concurrent applications with separate
resources, schemas, authorities, and HTTP mounts in one process. This is used
by repository tests and promised by public server-provider APIs. It is not an
unused capability.

The user explicitly approved the impact proposal in issue 3002 on 2026-09-20,
then confirmed that independent production applications can use separate
processes or containers and that parallel tests need isolated workers. That
approval is the bounded D-001 compatibility exception to milestone 30's
preservation rule. It does not authorize removing other plugin powers.

## Decision

### One resource-owning application

Within one JavaScript realm, only one application may initialize and own live
application resources. A normal Node process therefore runs one application;
isolated workers or separate processes may each run their own. Importing Core
creates no active application. There is no test-only bypass.

The guard belongs to Core and covers both `UltimaBase` and the lower-level
`FrameworkApplication`/engine entry points. Alternate public construction paths
or duplicate access paths must not create a second active owner. It is a
lifecycle ownership guard, not a global schema registry, request context,
credential store, default application API, or cross-plugin integration host.

| Phase                       | Exact contract                                                                                                                                                                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Construct                   | Validate static configuration and allocate inert instance state; do not claim the active slot or perform infrastructure work. Several definitions may coexist.                                                                                                                |
| Compile                     | Pure independent compilation remains allowed, including Typegen and conformance snapshots. No activation, resource materialization, or process-history compatibility ledger.                                                                                                  |
| Initialize                  | Acquire the slot synchronously before application capability factories or plugin setup. The same owner's repeated calls share work. A different owner fails before its resource effects and cannot change the incumbent.                                                      |
| Create asynchronously       | `createApplication()` initializes, so it acquires the same slot even when no listener starts. It does not gain an exemption.                                                                                                                                                  |
| Start                       | Initialize the owner, assemble Runtime, and run the existing ordered infrastructure phases. Concurrent calls on that owner share work. Only a fully started owner accepts public transport requests.                                                                          |
| Low-level execution         | An inert definition is not an executable application. Existing low-level engine use requires its initialized owner; it cannot bypass exclusivity. No new public activation method is introduced.                                                                              |
| Stop                        | Stop infrastructure according to existing ownership rules and invalidate request execution. Retain the slot while setup-owned resources exist. A stopped application cannot restart. Stop before startup retains its existing no-op semantics.                                |
| Dispose                     | Close execution, finish owned teardown, and release the slot only after cleanup completes. Serialize overlapping initialize/start/stop/dispose so a late phase cannot resurrect a disposed owner. Dispose of an inert/rejected candidate never releases another owner's slot. |
| Replace                     | After complete disposal, a fresh application may initialize with different schemas/plugins. Disposal is idempotent; a repeated call on an old owner cannot affect the replacement.                                                                                            |
| Failed initialization/start | Run all applicable cleanup in reverse order and retain original plus cleanup failures. Release the slot only after successful cleanup. The failed application never becomes an executable default or a reusable started instance.                                             |
| Failed cleanup              | Report the error and fail closed while resource release is unproven. Do not expose a force-reset or test bypass; a failed realm may need replacement. A later no-op dispose must not turn failed cleanup into proof of success.                                               |

Teardown must account for framework-owned in-flight work before releasing
ownership. Escaped promises, callbacks, request engines, models, operation
handles, and schema handles remain tied to their old owner and cannot execute
against a replacement. No late cleanup may clear a newer owner's resources.
Core cannot terminate arbitrary plugin-created work outside its lifecycle;
the existing trusted-plugin resource-ownership contract still applies.

### Concurrent request isolation is retained

One active application may execute many simultaneous requests. Async-local
scopes retain each request's immutable context, principal values, cancellation
signal, transaction, nested callback attribution, and Master provenance across
awaits, thrown callbacks, and nested request scopes. There is no global current
user or transaction and no serialization of ordinary requests.

Master stays application-bound and audited. A context, grant, model, or callback
from an old application never acquires the replacement's authority, even when
the same authority object or schema class is deliberately reused. Raw credential
verification and persisted session policy keep their existing semantics; this
decision does not revoke database-backed sessions merely because a process
restarts.

### One execution resolution rule

Static schema and Password User calls keep the current API: an active request
supplies its exact owner; outside a request, execution uses explicit
`{ ultimabase }`. Conflicting explicit selection fails. Lifecycle exclusivity
does not add an implicit global execution fallback.

Application, schema, operation, and model handles continue to belong to their
creating application. A stale handle fails instead of rebinding. Schema classes
and their frozen prototypes carry no application resources or authority.
Plugin mutation-name visibility describes the active graph rather than a
historical union of previously started applications; disposal removes that
application's visibility state. Captured inert dispatchers still validate the
selected graph on every call.

ADR-0197's independent pure compilation, local conflict checks, ownership, and
absence of a global surface fingerprint remain. Reusing a schema class with
different plugin surfaces remains valid in separately compiled graphs,
sequential application lifetimes, or isolated workers. Existing schema field
compatibility rules are not relaxed.

Typegen's `applicationId` remains an artifact identity and is independent of
HTTP `appId` and the private runtime owner. Multiple application definitions
can still generate separate outputs without activating multiple runtimes.
Generated files remain inert and replaceable; JavaScript needs no Typegen.

### One HTTP owner

The HTTP application capability and server provider graph belong to the sole
active application. A server cannot mount a second simultaneous application.
Remove `HttpApplicationMountTable`, its multi-application routing implementation,
application maps/sets, duplicate-mount selection, shared-policy comparisons,
and last-mounted-application listener accounting. Do not preserve them behind a
compatibility mode. Server authors consume the existing single `HttpApplication`
capability and its safe dispatch boundary. Retain any still-used protocol and
server-ownership contracts instead of deleting them merely because their source
file used to contain the mount table.

Keep `httpPlugin({ appId })` and exactly one original occurrence of
`X-UltimaBase-Application-Id`. The ID asserts the expected sole application;
it no longer selects among mounted applications. Missing, foreign, duplicate,
or malformed identity still fails through the existing safe HTTP boundary.
It is public and grants no authority.

Retain the exact owned browser-bootstrap path under
`/__ultimabase/apps/{encodedAppId}` and the infrastructure-only preflight
exception. Bootstrap ownership, reserved-path rejection, protocol compatibility,
original-header cardinality, route collisions, context resolution, session
validation, raw Master verification/audit, deadlines, and safe early errors
remain required. Removing the table must relocate these checks to the sole
HTTP boundary, not remove them. REST and GraphQL keep their existing URLs,
payloads, errors, and sibling dependency direction.

Managed Hono providers own their listener and graceful shutdown. An externally
owned Hono app retains its ordinary routes and listener ownership alongside one
UltimaBase application. CORS still has exactly one explicit owner; external
ownership conflicts, credential restrictions, cache-safe headers, and preflight
remain enforced. Only comparisons between several UltimaBase applications are
retired. Core gains no HTTP, Hono, or authentication vocabulary.

### Tests and deployment migration

Parallel test files retain isolated Vitest worker processes and independent
PostgreSQL schemas. Within one worker, dispose each application before
initializing the next. Tests exercising concurrent requests continue to do so
against one application. Pure definition/compilation comparisons need not
activate an application and remain parallelizable.

The public conformance harness retains its `application-isolation` contract,
testing clean sequential replacement and rejection of competing activation.
It must not require two initialized applications simultaneously. Its static
determinism and explicit plugin-instance checks remain. Multiple instances of
one plugin inside one application are unaffected.

Keep every policy, credential, foreign-authority, disposal, callback, transport,
and data-isolation assertion when reorganizing fixtures. Retire only successful
same-realm concurrent application activation, routing between shared mounts,
and the associated shared-policy/lifetime semantics. Test credentials from one
independent database against another using sequential lifetimes or separate
workers; do not weaken request-security tests into startup-error-only checks.

Production multi-application deployment uses separate processes, isolated
workers, or containers. A deployment may provide its own reverse proxy when
one public address is required. This decision adds no supervisor, Docker
orchestrator, routing service, shared pool, or production multi-tenant host.

## Delivery and documentation

Issue 3006 implements lifecycle ownership and migrates affected fixtures;
issue 3007 removes shared-server machinery. Their required test adaptations
may touch plugin suites without starting the later plugin-simplification wave.
This ADR alone ships no lifecycle or wire change. Current public documentation
continues to describe the current implementation until each change is delivered.

The implementation issues update the package READMEs, root architecture and
transport concepts, website application/testing/plugin-authoring/HTTP/Hono
journeys, and affected examples in the same audited commits. The
[impact note](../plans/2026-09-20-single-active-application-impact.md) records
their current source and test consumers. Older ADR prose remains history;
only the concurrency/shared-hosting portions named above are superseded.
Earlier concurrent-application language in ADR-0048, ADR-0066, ADR-0075,
ADR-0201, and ADR-0254 is likewise subject to this lifecycle boundary. Their
other guarantees remain; previously superseded registry APIs stay superseded.

## Alternatives considered

- Retaining concurrent active applications preserves current compatibility but
  keeps the ownership and shared-server complexity the user elected to remove.
- Restricting only `start()` leaves multiple materialized application resource
  owners and a lower-level bypass through initialization.
- Removing HTTP identity would create an additional client protocol change;
  the user approved retaining it.
- A test-only multi-application mode would preserve the retired architecture
  and create a second lifecycle contract. Worker isolation meets the test need.
- A global default application for ordinary execution would alter existing
  explicit and ambient resolution. It is not needed for lifecycle exclusivity.
