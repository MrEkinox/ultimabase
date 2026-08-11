# ADR-0187: Plugin-owned application compilation and Typegen contributions

- Status: accepted
- Date: 2026-08-11
- Refines: ADR-0002, ADR-0029, ADR-0051, ADR-0130, ADR-0173, ADR-0175, ADR-0177, ADR-0184
- Depends on: ADR-0186
- Refined by: ADR-0192, ADR-0193

## Context

The current static phase lets plugins declare FieldBuilder methods before Core
compiles the developer-provided `schemas` tuple. Plugins cannot yet add schemas,
transform existing definitions, contribute generic schema or field options, or
add model and operation surfaces. Typegen snapshots the compiled graph but has
no general protocol for plugin-owned declarations that exceed its built-in
vocabulary.

The open kernel requires plugins to change the final application contract while
preserving deterministic startup, exact TypeScript types, JavaScript operation
without generated artifacts, and application isolation.

## Decision

### One pure static declaration phase

Before schema compilation, every authorized plugin receives an owner-bound
declaration context for:

- schemas and schema selectors;
- FieldBuilder methods and logical field kinds;
- schema and field option namespaces;
- immutable schema and field patches;
- model static methods, instance methods, and handles;
- custom operations and query extensions;
- capability declarations;
- Typegen descriptors and contributors.

The phase is synchronous, deterministic, infrastructure-free, and independent
from setup services, adapters, transactions, clocks, network state, and secrets.
Plugin runtime options and secrets never affect the static fingerprint unless
the plugin has copied an explicit safe static value into its declaration
contract.

Developer declarations plus ordered plugin contributions form the authoritative
application graph. Each patch retains its owner and target. Duplicate additions,
cross-owner modifications without `schema:transform`, removed dependencies,
and ambiguous order fail instead of using last-writer-wins behavior.

### Schema and model identity

A plugin may contribute a stable exported schema class or create a dynamic
schema from static options. Stable classes remain ordinary `Schema.define()`
values. Dynamic schemas are available through `ultimabase.schema('ClassName')`;
Typegen gives literal names exact handles while JavaScript uses the same runtime
registry dynamically.

Fields, options, generated identities, model methods, operations, handles, and
plugin-owned public surfaces all participate in the compiled identity of a
schema class. Reusing one class in another application succeeds only when its
complete compiled surface is compatible. An incompatible second application
fails rather than leaking methods or metadata across applications.

### Typegen emits contracts, not a client

Runtime always recompiles and executes the real application graph. JavaScript
applications may omit Typegen and use every installed plugin dynamically.
TypeScript applications use `@ultimabase/typegen` to emit one inert `.d.ts`
contract that augments Core; no generated JavaScript client, delegates,
connection state, validation engine, or executable business callback is
introduced.

The generic generator covers facts expressed through the standard declaration
vocabulary. Plugins may additionally contribute at three levels:

1. `typegen:reference` supplies validated public type references;
2. `typegen:contribute` extends the application declaration through a structured
   TypeScript declaration model;
3. `typegen:emit` writes separately owned artifacts through validated atomic
   outputs.

`typegen:replace` is a distinct exceptional privilege. Contributors receive an
immutable callback-free snapshot, cannot mutate another owner's declarations,
and participate in collision checks and the application fingerprint. Ordinary
plugins do not write raw source when the structured declaration model can
express the contract.

Conditional Typegen privileges become active only when the Typegen capability is
installed. Without Typegen, no Typegen callback runs and plugin Runtime behavior
remains unchanged.

### Persisted contribution provenance

Schema snapshots and later migration plans retain the plugin owner and version
for persisted fields, indexes, codecs, and schemas. Removing a plugin never
silently drops stored data. Destructive cleanup requires an explicit migration
decision, and generated migration artifacts must retain enough immutable
metadata to remain inspectable after the originating plugin is absent.

## Consequences

- Plugins can create and transform the exact public application model without a
  generated client.
- TypeScript receives application-specific autocomplete while JavaScript remains
  a first-class no-Typegen runtime.
- Plugin authors implement runtime behavior once and provide structured type
  facts only where generic Typegen cannot derive them.
- Schema reuse across incompatible application plugin graphs becomes an early
  explicit error.
- Migration and Typegen fingerprints can explain which plugin produced every
  persisted or public contract.

## Non-goals

- Arbitrary source rewriting or TypeScript compiler plugins.
- Runtime behavior that depends on generated declarations.
- Mutable process-global schema, model, or Typegen registries.
- Automatic destructive cleanup when a plugin is removed.
