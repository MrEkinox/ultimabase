# ADR-0198: Plugin Typegen contracts are structured and application-local

- Status: accepted
- Date: 2026-08-12
- Refines: ADR-0187, ADR-0192, ADR-0193, ADR-0197
- Depends on: ADR-0187, ADR-0191, ADR-0193, ADR-0197

## Context

The final application graph may contain plugin-added schemas, fields, direct
options, operations, schema and model commands, and query extensions that Core
cannot infer from the developer's source declarations alone. Generic Typegen
can derive most of those contracts from the compiled graph, but correlated
public types and separately owned metadata sometimes need an explicit plugin
declaration.

Accepting arbitrary TypeScript text would let a plugin mutate another owner's
output, hide executable generation behind Typegen, or make fingerprints omit
meaningful imports and configuration. Making generated files Runtime truth
would also break JavaScript applications and application isolation.

## Decision

Core exposes three distinct static declaration facades:

- `typegen:reference` registers nominal public exported type references;
- `typegen:contribute` adds structured named declarations and same-owner schema
  or model surface refinements to the main application declaration;
- `typegen:emit` declares a separately owned `.d.ts` or deterministic JSON
  output.

Conditional privileges use the declaration-lifetime Typegen emitter capability.
When no emitter is installed, those facades are absent and no Typegen
declaration is recorded. JavaScript compilation and Runtime execution are
unchanged.

Type nodes are a closed callback-free structure containing primitives, JSON
literals, arrays, tuples, unions, objects, and registered public references.
Contributors cannot submit raw source. A schema or model augmentation may refine
only a same-owner command or query that exists in the final application surface;
it cannot invent Runtime behavior.

Core retains owner ID, optional instance ID, plugin version, contribution ID,
static options, destination, and inert contents in the compiled graph. Typegen
adds imports and final graph contents to its deterministic snapshot and
fingerprint. Duplicate declarations, owner-local contribution IDs, surface
properties, and output destinations fail deterministically.

Generic Typegen emits exact operation registries and schema surface registries.
Core's application handles read those declaration-merging targets for exact
string operation lookup, dynamic schema handles, direct commands, model
commands, and query inputs. Runtime values still come exclusively from the
compiled Core graph; generated declarations contain no client or executable
state.

Separate output is restricted to structured `.d.ts` declarations or JSON-safe
metadata. JavaScript destinations, binary data, callbacks, credential-shaped
metadata, connection configuration, and Runtime-client output are rejected.
Every output carries its own application-derived fingerprint and is replaced
atomically.

## Consequences

- Plugin fields and used direct options receive application-specific editor
  types without widening Core globally.
- Dynamic schemas and namespaced operations have exact TypeScript handles while
  JavaScript uses the same application graph without generation.
- Trusted plugins can express complex public contracts, but only through an
  inspectable structure whose provenance participates in reproducibility.
- Removing or changing a plugin makes the previous generated registry stale;
  regeneration replaces it without creating a generated Runtime client.

## Rejected alternatives

### Raw declaration callbacks or source strings

They are difficult to validate, fingerprint, compose, and attribute, and they
can emit contracts that do not correspond to the final Runtime graph.

### A Typegen registry outside Core compilation

A parallel registry could observe a different plugin order or schema graph and
would recreate the legacy global contribution bypass removed in milestone 14.

### Generated client objects

They would make Typegen part of Runtime identity and split JavaScript and
TypeScript execution paths. Application-owned Core handles already provide the
required call surface.

## Non-goals

- Executing custom operations or exposing them through transports.
- Arbitrary TypeScript compiler plugins or source rewriting.
- Emitting database clients, connection configuration, or executable code.
