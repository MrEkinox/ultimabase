# ADR-0196: Complete schema compilation uses a callback-free public IR

- Status: accepted
- Date: 2026-08-12
- Refines: ADR-0187, ADR-0190, ADR-0191, ADR-0192
- Depends on: ADR-0187, ADR-0190, ADR-0191, ADR-0192, ADR-0195

## Context

ADR-0192 reserves protected schema identity changes for one compatible
replacement of the complete schema compiler. The current compiler instead
receives internal `PreparedSchemaCompilation` objects that retain schema class
identity, factory-created fields, private WeakMap capabilities, and values such
as default factories. Passing those objects to a community compiler would make
private Core implementation details public and would expose executable values
through a declaration-lifetime capability.

Declaration capability values are immutable JSON-compatible facts. A complete
compiler implementation is necessarily executable, but its input and output
must remain deterministic, callback-free application data. The replacement
protocol therefore needs a stable intermediate representation rather than a
post-compilation transform or access to Core registries.

## Decision

### One public compiler IR

Core defines one versioned schema compiler intermediate representation. Static
declaration preparation executes authorized module-level declaration callbacks
once, validates and normalizes their values through their owning definitions,
and then emits one immutable compiler input.

The input records, in deterministic order:

- developer schema declarations and their application owner;
- plugin schema additions, option definitions, selectors, and patches;
- exact plugin and optional instance identity, package version, contribution
  identity, protocol version, and normalized static options;
- portable schema, field, index, constraint, extension, relationship, and
  option facts;
- nominal opaque references for already validated artifacts whose executable
  or class identity must remain private.

Every schema addition retains its contribution identity and normalized static
options. Extension nodes expose their declared logical field nodes beside the
opaque extension identity. Option nodes carry distinct definition and value
provenance so composition never loses either owner.

The IR contains no function, schema constructor, mutable registry, adapter,
service, request state, or infrastructure resource. Opaque references are
frozen nominal values owned by one compilation session. Their public shape
contains only inert identity data; Core retains the corresponding trusted
artifact in application-local private storage. References cannot cross
applications, be forged structurally, or be resolved by plugin code.

### Canonical and replacement compilers share the protocol

The current Core compiler becomes the canonical implementation of the same
public IR protocol. It does not run first when a replacement is selected. A
selected compiler receives the prepared input and returns one complete immutable
logical graph expressed through the IR output contract.

Output may select and compose only artifacts and normalized values present in
the input. It cannot invent owner identity, executable callbacks, schema
classes, fields, or contributions. Removing, replacing, or applying a declared
artifact remains an explicit graph decision with exact provenance.

Core decodes the output through the compilation-session artifact table and
always revalidates:

- application ownership and session identity;
- stable schema class and logical operation identity;
- exact Core system fields and minimum portable field contracts;
- relationship targets and cycles;
- contribution ownership, ordering, and provenance completeness;
- option, index, extension, and constraint compatibility.

Only a complete graph passing every invariant is published atomically.

### Capability carrier

The declaration-lifetime schema compiler capability carries only an inert,
versioned provider descriptor. `replaceSchemaCompiler(...)` creates one normal
owner-targeted capability replacement and privately associates its pure compiler
function with that exact nominal declaration. The callback never becomes the
declaration capability value or part of inspection metadata.

Core contributes the canonical provider directly to the capability inventory
as a foundation provider. It is not a configured plugin, does not participate
in plugin lifecycle, and cannot request privileges. Replacing this exact token
requires `schema:replace`; the generic `capability:replace` privilege does not
imply it and is not additionally required.

Replacement chains, version compatibility, missing or stale targets, branches,
and cycles continue to use the ordinary capability graph. No parallel compiler
registry or post-compilation callback exists.

## Consequences

- Community compilers depend on a versioned public logical protocol rather than
  private schema classes or Core source modules.
- The canonical compiler and every replacement receive identical input and are
  held to identical output validation.
- Declaration capabilities remain JSON-compatible even though the selected
  compiler implementation is executable private state.
- Preparing the IR becomes an explicit phase before logical schema compilation.
- The work is split into the IR contract, canonical compiler migration, and
  privileged capability replacement so each boundary can be reviewed and
  committed independently.

## Rejected alternatives

### Transforming the already compiled graph

This would preserve the current compiler as an unavoidable hidden stage and
would not be complete compiler replacement.

### Passing `PreparedSchemaCompilation` to plugins

This would expose schema classes, private field provenance, callbacks, and an
unstable internal contract.

### Storing the compiler callback in the declaration capability value

This would violate the immutable JSON-compatible declaration capability
contract accepted by issue 1420 and ADR-0195.

## Non-goals

- Dynamic Runtime schemas or application handles.
- Typegen rendering.
- Runtime pipeline, persistence-plan, physical-schema, or migration replacement.
- A generic public executable declaration-capability mechanism.
