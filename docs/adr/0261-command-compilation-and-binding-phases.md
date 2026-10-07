# ADR-0261: Command compilation and binding phases

- Status: accepted
- Date: 2026-09-20
- Refines: ADR-0259
- Implementation: issues 3008 through 3013

## Context and approval

ADR-0259 requires one canonical command graph and pure, atomic compilation.
Its wording also puts final transport metadata in that static phase. Existing
operation and schema-mutation binding providers instead return their nominal
command, protocol, metadata and codec from application-lifetime factories.
Soft Delete constructs both of its actual transport bindings in those factories.
Those values cannot be known during pure compilation without changing the
retained plugin API or executing resource factories prematurely.

The user explicitly approved the following phase refinement after this
contradiction was reported. The two command kinds, their semantics, public
authoring APIs and the migration order accepted in ADR-0259 remain unchanged.

## Decision

One private application-owned command graph has two construction phases:

1. Pure compilation validates and freezes nominal declarations, exact owners,
   names and versions, schema targets and aliases, payload/result facts,
   errors, authority and transaction semantics. Publication is atomic with
   schema compilation. It invokes no application capability factory.
2. Application materialization validates and freezes exact owner-bound private
   handlers/codecs and inert binding metadata, when their retained factories
   produce them. Binding checks precede the consuming transport projection and
   listener. Static declarations cannot be added, replaced or mutated here.

Each conflict or ownership check belongs to the phase where its inputs exist.
Materialization follows existing capability dependencies; it does not eagerly
invoke all factories to serve an unrelated static consumer. Resources are
created once and remain owned by the existing cleanup lifecycle, including
partial initialization failure. Disposal invalidates private executable views;
inert snapshots confer no execution authority.

Canonical records and private references are the source of truth. Derived
indexes and the bounded adapters needed for issues 3009–3012 cannot accept
registrations or independently decide command ownership. Migrating each
consumer removes its superseded authoritative state and validation. Issue 3013
audits removal of every obsolete adapter after those migrations.

No new public API, capability, extensible command family, transport-specific
Core vocabulary, second registration store or speculative metadata is added.
Typegen and pure compilation remain resource-free. Native CRUD and the Query
AST remain outside this graph. Private Master mutations remain excluded from
public transport projections.

## Validation

Protect deterministic inert compilation, exact nominal and owner identity,
atomic failure, both retained command kinds and selected surfaces. Prove that
compilation creates no resources, materialization invokes factories once,
callbacks never enter inert projections, failed initialization cleans up, and
disposed execution views cannot be rebound to another application. Retain
operation/mutation, source/packed, direct/transport and plugin parity tests at
each migration gate.
