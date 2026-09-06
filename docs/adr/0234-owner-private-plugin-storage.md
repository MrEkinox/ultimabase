# ADR-0234: Plugin-owned private records stay outside application schemas

- Status: accepted
- Date: 2026-09-06
- Refines: ADR-0187, ADR-0191, ADR-0192, ADR-0193
- Depends on: ADR-0186, ADR-0190, ADR-0191, ADR-0206

## Context

Password Auth must persist password verifiers and revocable session verifiers.
Those values are not application model data: ordinary Query, Typegen, generated
transports, Hooks, Access, and application observers must never receive them.

A normal plugin-contributed schema cannot provide that boundary. Plugin-owned
schemas are private from REST v1 CRUD generation, but they remain application
schemas with application handles and Typegen declarations. Access cannot be the
protection because it is optional, and Master authority controls who may bypass
authorization rather than hiding a storage surface from trusted application
code. Direct adapter calls would instead bypass Core's ownership, portability,
transaction, and migration contracts.

Credentials and sessions provide two immediate concrete consumers of the same
invariant. Core therefore needs one narrow owner-private persistence boundary,
not a Password Auth-specific repository or another public schema convention.

## Decision

### Private records are not application schemas

Core will expose a versioned owner-private record capability. An authorized
plugin may declare callback-free private collection descriptors containing
portable fields, exact unique indexes, references, and deterministic static
options. The compiled application fingerprint, adapter compilation, physical
schema intent, migration provenance, upgrades, and orphan handling retain the
declaring plugin ID, optional instance ID, package version, protocol version,
and stable collection contribution ID.

A private collection is deliberately absent from:

- the public compiled schema registry and `ultimabase.schema()`;
- schema-root and application Query handles;
- Typegen's application schema and model declarations;
- REST, GraphQL, and other generated schema transports;
- schema Hooks, Access rules, application validators, model commands, query
  extensions, and ordinary Runtime observers or events.

Private records are not hidden application schemas and cannot be recovered by
guessing a class name. A plugin cannot mark a developer schema private or move
an existing application schema across this boundary.

### Exact ownership replaces general query access

Core materializes one opaque private-store handle only inside callbacks owned by
the exact plugin instance that declared the collection. The handle can address
only that owner's collections and exposes typed `findUnique`, `insert`,
`update`, `delete`, and compare-and-swap operations. It exposes no arbitrary
schema selection, cross-owner lookup, raw adapter, SQL, persistence-plan
replacement, application registry, engine, or reusable authority grant.

Unique lookup and compare-and-swap are the complete v1 read and concurrency
vocabulary. There is no scan, unbounded filter language, relation loader,
include, aggregation, bulk mutation, or application-facing repository. A later
consumer must prove a concrete need before widening this API.

Private descriptors may reference one exact public application schema for
portable integrity. The reference stores only its stable object identity and
may declare `fail` or `cascade` deletion behavior. It does not make the private
record reachable from the public model or relationship graph.

### Storage retains transactions and structural integrity

Core validates complete private records at the owner boundary and delegates
portable persistence to the selected database capability. Reads may run in the
active request without opening a transaction. Mutations use the active
transaction when one exists and otherwise receive one automatic transaction.
This lets one plugin operation atomically combine an ordinary Runtime mutation
with private record writes through the same application adapter.

Private operations preserve cancellation, application isolation, database
constraints, adapter lifecycle, and rollback. They do not enter the public
schema Runtime pipeline: application Hooks, Access, validation providers,
protected policies, observers, result materialization, and events cannot see
secret-bearing records. This is a separate protected storage boundary, not a
general `skipHooks` or policy-bypass option.

### One critical privilege is explicit

The closed privilege vocabulary gains `storage:private` with critical severity.
It authorizes an exact plugin instance to declare and use only its own private
collections. Denial fails static compilation before private schema, migration,
setup, connection, Runtime, or transport effects. Installing no consumer
allocates no private-store runtime.

Private storage is not Master authority and emits no Master audit. It grants no
access to application schemas and creates no request authority mode or context
value. A plugin that separately elevates an ordinary request still declares
`authority:elevate`, requires the configured application `MasterAuthority`, and
follows ADR-0206 independently.

Plugins remain trusted in-process JavaScript. Core prevents accidental or
policy-denied use of its own persistence APIs; it does not claim to sandbox a
malicious package that uses ambient Node.js filesystem, process, or network
powers.

## Required implementation evidence

- The public application and Typegen inventories cannot discover a private
  collection or verifier field by name, class, owner, or generated handle.
- Another plugin instance, application callback, transport, Query, and raw
  operation input cannot acquire or forge the owner-private handle.
- Reads, mutations, rollback, unique conflicts, compare-and-swap races,
  public-reference deletion, application isolation, plugin-instance isolation,
  upgrade provenance, and orphaned storage are covered.
- PostgreSQL compilation and execution use the public capability and adapter
  bridges without Core importing PostgreSQL or a plugin issuing SQL.
- Diagnostics prove privilege denial happens before adapter and lifecycle
  effects, and applications without private storage retain zero behavior.

## Consequences

- Password Auth can store credentials and sessions without exposing their
  verifiers as application data.
- Core gains a generic protected persistence primitive but no authentication,
  User, credential, or session concept.
- Database plugins must compile private collection descriptors alongside, but
  distinctly from, application schemas.
- Private records deliberately trade public Query and hook behavior for strict
  owner containment.
- Issue 2322 implements and verifies this boundary before Password Auth starts.

## Non-goals

- A secret manager, encryption service, key vault, cache, generic repository,
  or database administration API.
- Private application schemas, hidden fields on public models, or access to
  another plugin's storage.
- Bypassing application policies for ordinary schema operations.
- Exposing raw adapters, SQL, transactions, or persistence plans to transports
  or application code.
