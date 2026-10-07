# ADR-0139: Drizzle-native PostgreSQL column value mapping

- Status: accepted
- Date: 2026-08-05
- Refines: ADR-0079, ADR-0083, ADR-0124, ADR-0138

## Context

The PostgreSQL adapter compiled Drizzle columns but kept a second value codec
on every compiled field. Query, mutation, cursor, relation, and record code
called that codec before passing values to Drizzle, while result rows were
decoded again after Drizzle returned them.

This duplicated a responsibility already supported by Drizzle columns and made
each operation path responsible for remembering the same conversion. It also
made static defaults use stored values in column metadata instead of the
logical values declared by the developer.

Drizzle custom columns expose `toDriver` and `fromDriver` mappings and can reuse
the driver's native PostgreSQL codecs. Its PostgreSQL client configuration also
allows native column codecs to refine driver values globally. Drizzle applies
these mappings to column parameters and selected values across its query
builders.

## Decision

Compiled Drizzle columns own the complete logical-to-driver and
driver-to-logical mapping boundary. Compatible scalar fields use native
Drizzle columns, including `bytea`, `time`, and string-mode `timestamp`. The
adapter extends Drizzle's native node-postgres codecs once so raw temporal text
becomes the canonical millisecond-precision Schema representation. The record
boundary detaches native `bytea` buffers and reapplies the declared scalar
snapshot invariant after Drizzle mapping. That read-only guard rejects values
such as an unknown portable enum member, an unsafe JavaScript integer, or SQL
`NULL` for a required field without duplicating parameter encoding. Pointer,
schema-guided JSONB, and portable plugin-storage fields use Drizzle `customType`
columns because their logical mapping depends on the exact field declaration.

Operation records, exact filters, ranges, cursors, relation identifiers, and
updates remain logical when passed to Drizzle. Compiled fields no longer retain
a parallel top-level codec. Static defaults also remain logical in Drizzle
metadata; direct synchronization calls the column mapping when rendering their
physical SQL expression.

Partial structured operations are the deliberate exception. A nested JSONB
path or partial typed object is not a complete physical column value, so its
selected child validation plan still encodes that fragment before it becomes a
JSONB parameter.

## Consequences

- Every complete column value follows one Drizzle-owned conversion path.
- Pointer target identity, binary values, temporal normalization, nested JSONB
  scalars, and portable plugin storage remain lossless.
- Native binary and temporal builders retain their complete Drizzle metadata;
  one client codec extension normalizes temporal strings and one record step
  detaches byte sequences and verifies logical scalar invariants.
- Query and mutation compilers no longer duplicate top-level encoding calls.
- Direct synchronization observes the same column mapping used by runtime
  statements.
- Partial structured JSONB parameters retain focused adapter encoding because
  Drizzle cannot infer a child field mapping from a whole-column definition.
