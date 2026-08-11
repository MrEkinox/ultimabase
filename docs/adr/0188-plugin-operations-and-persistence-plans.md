# ADR-0188: Plugin operations and rewritable persistence plans

- Status: accepted
- Date: 2026-08-11
- Refines: ADR-0063, ADR-0070, ADR-0076, ADR-0099, ADR-0100, ADR-0102, ADR-0103, ADR-0132, ADR-0164
- Depends on: ADR-0186, ADR-0187
- Refined by: ADR-0193

## Context

Community features need more than before/after callbacks. An authentication
plugin may add `login`, a workflow plugin may add `publish`, and a soft-delete
plugin must preserve a developer's logical delete semantics while physically
updating plugin-owned tombstone fields. Replacing `delete` with a public
`update` too early would apply the wrong Access, hook, audit, result, and
relationship semantics.

Plugin-defined values and operations must also cross adapters and transports
without extending Core's discriminated unions for every community concept.

## Decision

### Versioned custom operation envelope

Core retains its native portable operations and adds one generic namespaced
plugin-operation envelope carrying an operation name, protocol version,
validated immutable payload, schema target when applicable, and declared result
shape. An owner-bound registry associates that identity with normalization,
validation, execution, transaction policy, serialization, Typegen, and optional
transport bindings.

Declaring an operation does not expose it publicly. `transport:expose` and
transport-specific serialization are separate privileges and application
decisions. No transport input may manufacture Core master authority.

### Logical operation versus persistence plan

Runtime keeps the normalized logical operation requested by the developer
immutable after its semantic validation boundary. Hooks, Access engines,
diagnostics, audit behavior, public result typing, and transaction policy observe
that logical intent.

Before adapter execution, Runtime compiles a separate immutable persistence
plan. An authorized `persistence:rewrite` contribution may replace that plan
while retaining the logical operation and its accumulated private constraints.
`runtime:intercept`, `runtime:constrain`, `persistence:rewrite`, and
`runtime:replace` remain distinct privileges.

A soft-delete contribution therefore performs:

```text
logical delete
→ delete authorization and business lifecycle
→ physical update of tombstone fields
→ delete-shaped result and committed event
```

It does not start a nested public update or replay update Access and hooks.
Item-oriented collection deletes rewrite each singular persistence plan inside
the existing atomic batch transaction.

### Protected constraints and adapter capabilities

Policy and visibility plugins may append private monotonic guards, row filters,
field restrictions, and opaque adapter constraints. Ordinary middleware cannot
inspect, clear, or broaden another contribution. Rewritten persistence plans
must carry the same protected target restrictions into the actual database
statement.

Adapters advertise versioned capabilities for plugin operation plans, logical
value codecs, transport codecs, constraint compilers, and physical schema or
migration contributions. Missing or incompatible capabilities fail during
application assembly rather than at the first request.

Logical values distinguish their runtime representation, JSON representation,
transport representation, storage codec, and Typegen reference. Core never
assumes those representations are identical.

### Master authority

Master authority and the master-key boundary remain in Core. Replacing Runtime,
rewriting persistence, contributing Access, or exposing a transport does not
grant master authority. Only the audited Core elevation facade guarded by
`authority:elevate` can create master execution, and that facade is never
provided to transports.

## Consequences

- Plugins can add arbitrary operations without expanding Core for every product
  vocabulary.
- Soft delete, tenancy, ACL, audit, cache, and workflow behavior compose around
  one preserved logical intent.
- Access and hooks can remain semantically correct even when the physical write
  differs from the public command.
- Transport exposure, wire codecs, storage codecs, and migration support become
  explicit compatible capabilities.
- Runtime and adapters require a new plan boundary and provenance-aware
  conformance tests.

## Non-goals

- Treating a persistence rewrite as a second public Runtime operation.
- Automatically exposing every plugin operation through installed transports.
- Allowing ordinary business middleware to weaken protected constraints.
- Moving master authority out of Core.
