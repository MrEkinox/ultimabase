# ADR-0103: Versioned adapter constraint compilers

- Status: accepted
- Date: 2026-08-02
- Refines: ADR-0048, ADR-0063, ADR-0083, ADR-0090, ADR-0102
- Refined by: ADR-0104

## Context

Runtime now accumulates policy-neutral `DatabaseConstraintNode` values without
interpreting their payloads. PostgreSQL still rejects every non-empty
constraint collection because it has no application-owned way to discover the
compiler responsible for a community or permission plugin's namespaced node.

A single constraint kind may evolve its payload over time, and different
database adapters need different safe compiled representations. Core must
preserve plugin ownership and application isolation without importing Drizzle,
SQL, PostgreSQL, or the configuration of a concrete policy.

## Decision

### Explicit portable payload versions

Every `DatabaseConstraintNode` carries `kind`, `version`, and `payload`.
`version` is a positive safe integer and retains its exact numeric literal in
TypeScript. Runtime continues to validate, snapshot, and transport only the
portable envelope; it does not decode payload meaning or select a compiler.

The portable identity of a payload contract is `(kind, version)`. Changing the
payload incompatibly requires a new version. A compiler for another version of
the same kind is not a fallback, and version negotiation is not implicit.

### Owner-bound application registry

`PluginSetupContext.constraintCompilers` is a dedicated setup-only facade.
Plugins register protected compiler definitions through it while Core derives
the owner from the current plugin context. Definitions never trust a plugin-
supplied owner name and do not use the generic hooks, operators, services, or
pipeline-stage registries.

Each concrete adapter publishes one provenance-protected compiler target. The
semantic registration identity is `(adapter target identity, kind, version)`.
Two contributions with that same identity in one application fail during setup
with deterministic diagnostics containing both owners.
The same identity may be registered independently in another application.

Registration closes before infrastructure lifecycle phases begin. Core retains
an immutable application-scoped view, and each selected adapter filters that
view by its own protected target identity. Definitions for another adapter
cannot collide with or be invoked by the selected adapter.

### Adapter-owned compiler contracts

Core owns only neutral target identity, versioned metadata, provenance, and
registry lifetime. A target's exact compiler input and output types belong to
the concrete adapter package and remain opaque to Core and Runtime.

`@ultimabase/postgres` therefore owns the protected PostgreSQL compiler factory.
Its compiler first decodes the portable payload into the exact type expected by
that `(kind, version)` definition, then returns a PostgreSQL-owned opaque
parameterized predicate. Structural lookalikes, raw return values, and public
Drizzle `SQL` values are not valid compiler outputs or dynamic interpolations.
Only code-owned static template fragments become SQL; every dynamic portable
value becomes a driver parameter. PostgreSQL validates output provenance before
it reaches its private Drizzle compiler.

This boundary lets a compiler use Zod or another validator internally without
making one validation library part of Core's contract. Invalid input remains an
untrusted boundary even when the plugin that originally created the constraint
had a precise TypeScript payload.

### Fail-closed PostgreSQL composition

Before issuing a database command, PostgreSQL resolves and executes every
constraint compiler in collection order. It fails closed when:

- no compiler claims the node's kind;
- the kind exists but its exact version is unsupported;
- payload decoding fails;
- a compiler definition or output lacks valid provenance;
- compilation throws or produces an invalid predicate;
- an operation has no safe predicate attachment point for a contributed node.

Only after every node compiles successfully does PostgreSQL combine the
resulting predicates with the normalized Query predicate using parameterized
logical `AND`. No raw payload value is interpolated into SQL. Singular prepared
updates and deletes apply the combined predicate while selecting and locking
their stable target, so later execution by retained identifier cannot bypass
the policy decision.

Diagnostics identify the adapter, kind, version, contribution, and owner where
available, but public errors reveal neither payloads, parameters, generated SQL,
nor driver details.

### Dependency direction and integration packages

A database-neutral policy package emits portable versioned nodes and does not
import PostgreSQL. A PostgreSQL-specific compiler belongs in application
composition or a dedicated integration plugin that may depend on the policy
contract and `@ultimabase/postgres`. The foundational policy package must not
gain a concrete database dependency merely to register a compiler.

Core and Runtime never import the adapter-specific compiler output. PostgreSQL
may import neutral Core contracts, preserving the existing dependency direction.
Any future official integration package that depends on both a policy and a
database adapter must be represented explicitly as a higher integration layer
in the repository graph.

## Consequences

- Constraint payload evolution is explicit and cannot silently select an older
  compiler.
- Compiler ownership and duplicate diagnostics remain deterministic without
  trusting plugin metadata.
- Separate applications may configure different compilers for the same portable
  identity without sharing mutable state.
- PostgreSQL keeps Drizzle private while community integrations receive a typed,
  safe output contract.
- Runtime remains unchanged when a new adapter, policy, kind, or payload version
  is introduced.
- A policy node without a compatible compiler makes the operation unavailable
  before any database effect rather than being ignored.
