# Milestone 6 — GraphQL and cross-transport parity

- Status: in-progress

Rebase the GraphQL backlog on the trusted capability kernel and the completed
HTTP, REST, and Password Auth vertical, then expose the same application Runtime
through a network-independent GraphQL plugin and an optional Yoga HTTP adapter.

The original pre-kernel HTTP and REST issues 601 through 607 are preserved as
superseded history. Their replacements live in
[`issues/2300-http-rest-password-auth/`](../2300-http-rest-password-auth/).
GraphQL Core never depends on HTTP or REST. Yoga depends on the shared HTTP
plugin and GraphQL Core, never on REST.

## Execution order

1. [x] [608 — Decide the GraphQL v1 contract and kernel boundaries](608-graphql-v1-contract.md)
2. [x] [609 — Implement the GraphQL plugin lifecycle and structural schema](609-graphql-plugin-schema.md)
3. [ ] [610 — Generate and normalize GraphQL read inputs](610-graphql-read-inputs.md)
4. [ ] [611 — Implement GraphQL-owned Relay connections](611-graphql-relay-connections.md)
5. [ ] [612 — Execute generated GraphQL schema operations](612-graphql-schema-execution.md)
6. [ ] [613 — Expose explicit plugin operations through GraphQL](613-graphql-plugin-operations.md)
7. [ ] [614 — Add custom schema composition and networkless execution](614-graphql-schema-composition-executor.md)
8. [ ] [615 — Mount GraphQL through Yoga and the HTTP capability](615-graphql-yoga-plugin.md)
9. [ ] [616 — Add optional GraphQL explorer plugins](616-graphql-explorer-plugins.md)
10. [ ] [617 — Verify and audit GraphQL cross-transport parity](617-graphql-cross-transport-audit.md)

## Existing foundations

- Core already owns immutable schemas, Query and Operation ASTs, application
  request execution, request-context provenance, Runtime, transactions, and
  generic protected constraints.
- `@ultimabase/http-plugin` already owns application selection, request context
  resolution, audited Master exchange, Fetch-compatible mounts, browser policy,
  cancellation, and failures before route dispatch.
- `@ultimabase/rest-plugin` is a sibling reference implementation, not a
  dependency or a reusable GraphQL implementation layer.
- Password Auth already owns explicit application operations and HTTP session
  resolution. GraphQL may expose those operations only through Core's canonical
  operation-transport bridge.
- Core exposes offset pagination only. Relay cursors and connection response
  metadata belong entirely to the GraphQL package.

## Accepted boundaries

- `@ultimabase/graphql-plugin` generates, composes, and executes one
  application-local `GraphQLSchema` without importing an HTTP server, Yoga,
  REST, authentication, Access, ACL, or a database implementation.
- `@ultimabase/graphql-yoga-plugin` owns Yoga and contributes an HTTP mount
  through `@ultimabase/http-plugin`. It receives the already selected
  application and resolved request context through that public boundary.
- GraphQL enters Runtime only through Core's narrow
  `ApplicationRequestExecutor`. It never receives a `FrameworkEngine`,
  `RequestEngine`, `FrameworkApplication`, `UltimaBase`, adapter, authority,
  grant, transaction, or lifecycle mutation facade.
- Generated schema exposure and explicit plugin-operation exposure remain
  separate from authorization. Installed policy providers are enforced only by
  the shared Runtime pipeline and are never inspected or named by GraphQL.
- Plugin fields and plugin operations require exact owner-supplied GraphQL wire
  compatibility. GraphQL never guesses from storage codecs or imports their
  owners.
- Importing a GraphQL package installs no behavior. GraphQL, Yoga, and HTTP are
  explicit sibling plugins; Yoga never installs either dependency.
- Generated relationship selections reuse Core's eager inclusion contract. V1
  adds no framework DataLoader; custom resolvers own any request-local batching
  they choose to implement through ordinary application APIs.

## Stop boundaries

- Issue 608 must replace the underspecified pre-kernel GraphQL contract with an
  accepted ADR and explicit user approval before package implementation begins.
- If the existing application request executor cannot express a required
  GraphQL operation, implementation stops for a focused ADR instead of exposing
  a general engine or arbitrary Runtime executor.
- Dynamic output restriction must remain monotonic without GraphQL importing or
  introspecting Access, ACL, authentication, or another policy provider. The
  public nullability and error behavior must be decided before schema generation.
- Subscriptions, live queries, federation, uploads, `@defer`, `@stream`, persisted
  queries, schema registry publishing, and client code generation remain outside
  this milestone unless separately activated.

## Completion gate

The milestone closes only after source, built, packed-package, Typegen-free,
generated TypeScript, networkless, real Yoga HTTP, browser-facing, authenticated,
multi-application, and PostgreSQL Testcontainers evidence proves that GraphQL
uses the same Runtime semantics as direct TypeScript and REST execution. The
final gate also audits dependency direction, privilege reporting, application
isolation, safe errors, cancellation, lifecycle cleanup, documentation, package
archives, coverage, and repository-wide validation.
