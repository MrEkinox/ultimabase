# ADR-0124: Portable plugin-field storage codecs

- Status: accepted
- Date: 2026-08-04
- Refines: ADR-0002, ADR-0007, ADR-0029, ADR-0080, ADR-0122
- Refined by: ADR-0193

## Context

Plugin-defined fields are logical Schema values. A database adapter cannot infer
their physical representation from a namespaced kind, while importing every
field plugin would reverse the dependency graph and make optional capabilities
part of the adapter.

Persisted ACL demonstrates the boundary: Core must not know ACL, the ACL plugin
must not know PostgreSQL, and PostgreSQL still needs a strict value codec and an
indexable physical column. Community fields need the same path without a new
cross-package integration for each field kind.

## Decision

`definePluginField()` may declare one private `storageCodec` capability. The
codec has a positive version, the portable `json` format, and exact `encode` and
`decode` functions. Core validates the declaration, reapplies the field's scalar
snapshot guard in both directions, and keeps the codec outside public field
metadata. The capability therefore cannot leak executable callbacks into schema
plans or transports.

Adapters explicitly opt into portable formats through Core's public capability
reader. PostgreSQL compiles a JSON codec-backed plugin scalar to a non-null JSONB
column when required. Unsupported plugin fields without a portable codec remain
rejected, so a specialized plugin such as vector storage can continue to own a
dedicated adapter compiler.

A single non-unique index over JSONB uses GIN. Unique or composite indexes keep
B-tree semantics. PostgreSQL synchronization, catalog introspection, drift
planning, and SQL rendering retain the selected method so a B-tree/GIN mismatch
is repaired deterministically.

The ACL plugin declares a versioned JSON codec on its reserved required field.
Its public ACL document is currently the physical value, but the codec boundary
allows a future physical version to diverge. Logical role selectors are resolved
through the neutral role service into schema-qualified UUID references before
the codec runs, so persisted ACL documents never depend on mutable role names.

## Consequences

- Core and PostgreSQL remain independent from ACL and community plugin kinds.
- Plugin authors can make portable JSON values persistable without exposing
  adapter details in field metadata.
- PostgreSQL can create and synchronize GIN indexes for row-local ACL checks.
- Codec versions describe the plugin-owned physical contract; migrations between
  versions remain adapter/plugin migration work.
- Specialized non-JSON storage still requires an explicit adapter integration.
