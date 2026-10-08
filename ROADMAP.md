# Roadmap

UltimaBase is pre-release: nothing has been published to npm yet. This
document lists the proposed directions after the first usable release. Planned
is not shipped: an entry is neither a release date, an implementation order
nor a final API, and every entry still needs design review against
[ARCHITECTURE.md](ARCHITECTURE.md) and the accepted ADRs before work starts.

The delivered milestones, their issue backlog and plans are archived in Git:
tag `reference-archive` holds the reference implementation with its complete
development archive (`issues/`, `docs/plans/`, `CURRENT_PLAN.md`), and tag
`rebuild-archive` holds the package-by-package rebuild with its process
records (`docs/rebuild/`, per-package `REBUILD*.md`). Entries below cite their
archived issue number for that context.

## Before the first release

- **Initial release notes.** The development changesets were discarded because
  they described intermediate APIs nobody shipped. The first publication adds
  one changeset describing the initial release of every public package.
- **Plugin versions.** Official plugins declare `version: '0.0.0'` literals in
  their manifests and public types. Derive them from each `package.json` before
  the first version bump so manifests and packages cannot drift.
- **Publication decision.** Product name, npm scope ownership, documentation
  hosting and the release procedure in [docs/RELEASING.md](docs/RELEASING.md).

## Hardening

### ACL reference lifecycle

Batch ACL reference cleanup with stable cursors instead of one unbounded list,
then define a provider-neutral protocol so concurrent ACL writes cannot create
a live reference to a subject being deleted under `fail` or `cascade`. Only
then restructure the ACL runtime internals and close with one public-export
proof of the hardened vertical. Archived issues 432–435.

### Field Access sibling dependencies

Let one field Access rule explicitly select sibling values and receive the
materialized dependency object, without TypeScript pretending the Runtime
loaded values it did not request. Archived issue 439.

## Next priorities

### File fields

An optional plugin with a typed plugin-defined `fileField`, file metadata,
upload authorization and storage adapters. The field API and blob lifecycle
still need design review. Archived issue 705.

### Caching

Cache contracts for normalized query results that never bypass access rules or
serve stale private data, invalidated after committed mutations. Archived
issue 713.

## Application capabilities

### Tenant isolation

Typed tenant request context compiled into a non-bypassable native Access
filter on every configured schema operation, composing with Access, ACL and
relations. Archived issue 724.

### Realtime

First a transport-independent contract for post-commit create, update, delete,
enter and leave events with safe subscription boundaries; then an isolated
in-memory adapter for tests and development, and a Redis adapter that
distributes events between instances. Archived issues 708–710.

### Background jobs

An optional BullMQ plugin whose job handlers run with explicit request
authority, retry and idempotency metadata. Archived issue 712.

### Reliable event delivery

A PostgreSQL outbox plugin that persists post-commit event intent atomically
with business transactions, with at-least-once delivery. Archived issue 711.

### More authentication

A Better Auth plugin built only on the public HTTP, operation, schema and
request-value capabilities, independent of Password Auth and without adding
authentication to Core. An HTTP Basic plugin for internal or service-to-service
use is deferred. Archived issues 707 and 748.

## APIs and developer tools

### OpenAPI

An OpenAPI description generated from schema and REST metadata, never a second
API definition to maintain. Archived issue 715.

### TypeScript SDK

A generated client with schema-derived inputs, selected results, cursors and
errors. Archived issue 719.

### React Query SDK

Generated query options and mutation helpers on top of the TypeScript SDK, with
React as an optional dependency. Archived issue 720.

### gRPC

Generated gRPC services that normalize into the same operation pipeline and
map framework errors to gRPC status codes. Archived issue 714.

### Developer CLI

Manual commands for deterministic schema generation, watch mode and CI
verification without starting the application (deferred), followed by the
general application CLI. Archived issues 808 and 716.

## Data and storage

### PostgreSQL migrations

A separate migration plugin with versioned normalized snapshots and applied
history, deterministic SQL plans from schema differences, startup application
with locking and drift detection, and generate, apply, status and repair CLI
commands. Archived issues 513–515 and 717.

### Column-backed object fields

An explicit PostgreSQL-specific alternative to JSONB storage that compiles
nested object fields into prefixed columns while keeping one logical field and
the portable `objectField` contract. Archived issue 704.

### Advanced field plugins

Independent money, encrypted, hashed, geo and other advanced stored-field
plugins. Archived issue 725.

## Shipping and operations

### Durable audit

A persisted audit trail of actor, reason, operation, object, ACL changes and
Master use, redacting sensitive values. Archived issue 721.

### Observability

Vendor-neutral tracing contracts and an optional OpenTelemetry plugin covering
transports, hooks, adapters and pipeline stages. Archived issue 722.

### Health and readiness

Lifecycle-aware liveness and dependency readiness with optional HTTP exposure
that hides sensitive dependency details. Archived issue 726.

### Administration

A separately deployed administration application built on public APIs, with
explicit audited Master authority for privileged actions. Archived issue 727.
