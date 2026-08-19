# ADR-0193: Plugin operation, transport, adapter, and Typegen bridges

- Status: accepted
- Date: 2026-08-11
- Refines: ADR-0031, ADR-0042, ADR-0063, ADR-0124, ADR-0187, ADR-0188, ADR-0190, ADR-0191, ADR-0192
- Depends on: ADR-0188, ADR-0190, ADR-0191, ADR-0192

## Context

ADR-0188 defines namespaced operations, value codecs, persistence plans, and
adapter requirements, but declaration alone does not define the public call
surface or assign ownership for Runtime execution, transport exposure, physical
schema metadata, and migration integration.

`typegen:emit` must also remain consistent with the decision not to generate an
executable client.

## Decision

### One operation handle from JavaScript and TypeScript

Stable plugins export nominal operation tokens. Dynamic operations are resolved
by namespaced name and version from one application. Both forms use the same
application-owned handle:

```ts
await ultimabase.operation(publishOperation).execute(input)
await ultimabase.operation('workflow.publish').execute(input)
```

Typegen narrows known string literals and token contracts. JavaScript performs
the same runtime payload and result validation. Operation handles contain no
connection, adapter, or generated code and cannot execute after application
disposal.

Issue 1416 records each operation's complete public error vocabulary in the
inert Typegen snapshot. This additive snapshot field advances the snapshot
format to version 3 so consumers never interpret the older format as complete.

The operation provider owns normalization, input validation, logical execution,
result validation, safe plugin errors, and transaction policy. Execution enters
the ordinary RequestEngine and capability middleware. Schema-targeted operations
may also appear on the relevant application schema handle. A model handle may
bind one operation to an exact protected identity without changing the
operation envelope.

### Explicit transport exposure

An operation declaration is private to direct application execution. A transport
plugin may expose it only when:

1. the operation owner requested and received `transport:expose`;
2. a compatible transport binding and wire codec exist;
3. application or transport configuration includes the operation in its public
   exposure policy.

Transport input is normalized into the same operation token and cannot select
Master, a Runtime replacement, or a raw adapter. Transport-safe error mapping
uses only the public framework or namespaced plugin error payload.

### Versioned adapter integration families

Database and infrastructure adapters advertise separate versioned capabilities
for:

- logical value storage codecs;
- opaque constraint compilers;
- persistence-plan kinds;
- physical schema contributions;
- migration contributions;
- transaction-scoped raw adapter access.

Application assembly validates every required family and protocol version before
infrastructure starts. A plugin may support several adapters through separate
bridge packages without Core or the logical plugin importing a concrete driver.

`adapter:consume` resolves public portable adapter capabilities.
`adapter:raw` resolves only an adapter-owned nominal facade inside setup or the
active transaction callback. A raw handle cannot escape its lease, does not
grant Master, and makes the consuming plugin explicitly adapter-specific.

Physical schema and migration contributions retain plugin and instance
provenance. Database plugins compile them; Core never emits database-specific
DDL. A rewritten persistence plan must still carry the protected constraints
of its logical operation into every physical statement.

Issue 1417 implements these families as separate protocol-1 Core capabilities.
Adapter-specific contribution tokens compose only after Core has attached the
real plugin ID, optional instance ID, package version, protocol version, stable
contribution ID, and normalized static options. Physical metadata uses
`adapter:consume`; migration metadata uses `migration:contribute` independently.
Generic capability replacement and decoration cannot impersonate these fixed
adapter protocols.

Raw capabilities are nominal tokens owned by the concrete adapter package.
Core exposes their implementation only through a revocable setup or active
transaction callback, and does not place authority, protected-constraint
controls, or commit and rollback methods on that facade. Migration planning
compares previous and current attributed snapshots, requires a matching explicit
upgrade intent for changed contributions, and retains removed contributions as
orphaned metadata rather than inferring destructive work.

### Typegen output remains inert

`typegen:emit` may write separately owned `.d.ts` declarations and deterministic
non-executable metadata such as JSON manifests. It may not emit JavaScript,
native binaries, executable callbacks, connection configuration, or a Runtime
client. Another plugin may provide unrelated code-generation behavior through a
different capability, but it is not Typegen and cannot masquerade as Runtime
truth.

## Consequences

- Custom operations have one concrete no-client call surface in TypeScript and
  JavaScript.
- Runtime execution, transport exposure, and adapter integration have separate
  privileges and explicit owners.
- Logical plugins remain portable while adapter-specific bridge packages can
  use raw or physical capabilities deliberately.
- Typegen participation cannot quietly become Prisma-style client generation.

## Non-goals

- Automatically exposing every installed operation.
- Giving Core a generic raw SQL API.
- Treating physical migration work as part of static schema compilation.
- Generating an executable Typegen client.
