# ADR-0278: Owner-private storage stays an addressable-record boundary

- Status: accepted
- Date: 2026-09-28
- Refines: ADR-0234, ADR-0266, ADR-0268
- Approval: user authorized the complete future-complexity reduction milestone on 2026-09-28

## Evidence

Password Auth is the only product consumer. Its credential and session
collections use `insert`, exact `findUnique`, and `compareAndSwap`. Generation
counters invalidate every account session without scanning or bulk-updating
session rows. Core and PostgreSQL tests additionally protect exact `update` and
`delete`, which remain supported operations.

Private descriptors already retain their exact owner and optional instance,
package and protocol versions, normalized static options, portable fields,
unique indexes, public-schema references, contribution payload, deterministic
fingerprint, transaction binding, synchronization, orphan preservation, and
adapter lifecycle. None of those capabilities requires a Query language.

The remaining mismatch was the adapter request type: its operation `kind` was
closed, but `data`, `where`, and `expected` were all optional on one broad
interface. Adapter implementations therefore had to add empty fallbacks and
could not use TypeScript narrowing to prove the fields required by each
operation.

## Decision

Owner-private storage remains limited to five addressable-record operations:

- `findUnique` selects at most one record through one declared exact unique
  index;
- `insert` writes one complete structurally validated record;
- `update` and `delete` affect at most one exact uniquely selected record;
- `compareAndSwap` updates that record only while exact expected fields match.

The Core-to-adapter request is one discriminated union with only the fields
required by each operation. Core continues to validate and snapshot all inputs
and complete adapter results. Adapters receive no public Query AST, authority,
schema registry, raw transaction, or reusable owner grant.

Data belongs in an application schema when it needs scans, arbitrary filters,
ordering, pagination, aggregation, bulk mutation, relations, Hooks, Access,
validation providers, observers, Typegen model declarations, or generated
transports. Cross-plugin behavior that does not represent application data
belongs behind a focused versioned domain capability.

No generic private scan, filter language, bulk API, relation loader, migration,
upgrade planner, cleanup protocol, or transport is added. A future need for one
of those behaviors requires a new architectural decision instead of widening
the record handle incrementally.

## Consequences

- Existing owner, identity, metadata, transaction, synchronization, reference,
  lifecycle, and all five operation capabilities remain intact.
- Adapter authors can switch on `kind` and receive exact required properties
  without defensive empty-object fallbacks.
- Password Auth retains account-wide revocation without a private bulk API.
- Public and type tests make Query-like expansion an explicit reviewed change.
- Private storage remains intentionally smaller than application schemas rather
  than becoming a parallel ORM and migration product.
