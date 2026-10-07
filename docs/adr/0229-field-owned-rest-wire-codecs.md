# ADR-0229: Plugin fields own nominal REST wire codecs

- Status: accepted
- Date: 2026-09-05
- Refines: ADR-0124, ADR-0188, ADR-0193, ADR-0228
- Depends on: ADR-0190, ADR-0191, ADR-0228

## Context

ADR-0228 requires a plugin-defined scalar to provide an exact portable REST v1
codec before a schema containing it can expose a route. Core currently retains
only the field's logical snapshot and optional storage codec. Reusing that
storage codec would contradict ADR-0188: logical, transport, and storage
representations are distinct contracts.

The codec must remain owned by the field package, must not appear as executable
schema metadata, and must not teach Core about REST.

## Decision

Core field factories may retain owner-attached JSON wire codecs behind the same
private field capability boundary used by logical snapshots and storage codecs.
Each codec targets one nominal protocol object by identity. Core validates the
declaration, reapplies the field's logical snapshot after decoding and before
encoding, rejects duplicate codecs for one protocol, and exposes only an exact
protocol lookup. Codec callbacks never enter schema metadata or compiled ASTs.

`@ultimabase/rest-plugin` defines the nominal REST v1 field-codec factory using
its existing `ultimabase.rest@1.0.0` protocol identity. A plugin field owner
attaches the returned codec in `definePluginField({ wireCodecs })`. REST route
compilation rejects an exposed schema when any nested plugin-defined field lacks
that exact codec. REST never falls back to a storage codec or guesses from a
namespaced field kind.

The first implementation decodes complete plugin scalar operands used by native
read filters. It does not add plugin-specific query operators, reinterpret a
field's distinct structural-containment operand, or expose new Runtime behavior.

## Consequences

- Plugin fields can define transport and storage representations independently.
- Route availability fails during application compilation rather than on the
  first request.
- Core remains transport-neutral and stores executable callbacks only in its
  private field capability map.
- A later REST response encoder can reuse the same exact owner codec without
  creating a second public contract.

## Non-goals

- A universal codec registry detached from exact field definitions.
- Automatic conversion from storage codecs.
- Plugin operations, mutation decoding, or response serialization.
