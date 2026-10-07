# 1413: Prove workflow, value-codec, and JavaScript plugins

- Status: completed
- Milestone: 14
- Packages: `@ultimabase/core`, `@ultimabase/typegen`, `@ultimabase/plugin-kit`, `@ultimabase/testing`, `@ultimabase/postgres-plugin`
- Depends on: 1412, 1417
- ADR: ADR-0186, ADR-0187, ADR-0188, ADR-0190, ADR-0191, ADR-0192, ADR-0193

## Goal

Exercise the complete public kernel through representative fixture plugins
before official Hooks and Access depend on it.

## Acceptance criteria

- [x] A workflow fixture adds an option, fields, a dynamic schema, model methods, a custom operation, a complex Typegen contribution, and a committed event.
- [x] The workflow operation executes through stable and dynamic handles in TypeScript and no-Typegen JavaScript, and a fake transport exposes it only through explicit policy.
- [x] A logical value fixture contributes Runtime validation, JSON serialization, an exact Typegen type, PostgreSQL storage, filtering, and physical schema metadata.
- [x] A soft-delete fixture adds tombstone metadata, a private visibility constraint, restore and purge operations, and delete persistence rewrites without update semantics.
- [x] A JavaScript fixture runs all applicable dynamic schemas, methods, operations, and inspection APIs with Typegen absent.
- [x] Privilege policies can deny each sensitive fixture power before declarations or infrastructure effects.
- [x] Two applications with different graphs remain isolated, and incompatible reuse of one schema class fails clearly.
- [x] Two explicit instances of one fixture remain isolated, and one upgrade plus orphaned-removal migration plan retains exact provenance without automatic destruction.
- [x] All fixtures use only public Core and plugin-kit APIs and pass the public conformance harness.

## Tests

- [x] Source, packed, language-service, JavaScript, Runtime, PostgreSQL, migration-metadata, rollback, and application-isolation suites cover the complete matrix.
- [x] Snapshots prove deterministic provenance, privilege reports, Typegen contents, and capability graphs.

## Out of scope

- Publishing the fixture plugins as supported product packages.
- Extracting native Hooks or Access.

## Implementation notes

- The filtering proof exposed one missing portable contract. With explicit user
  approval, ADR-0192 now grants non-list plugin scalars with ADR-0124 JSON
  codecs only complete-value `eq`, `ne`, `in`, and `notIn`. Core, Typegen, and
  PostgreSQL tests protect the exact boundary; no operator registry or ordered,
  string, structural, or domain-specific operators were added.
- Core attributes a raw adapter lease to the owner of an operation handler and
  requires the operation declaration and handler to have the same owner. The
  portable soft-delete plugin therefore owns tombstone visibility and delete
  rewriting, while its PostgreSQL integration plugin owns the backend-specific
  restore/purge declarations, model commands, handlers, and `adapter:raw`
  privilege. No delegated authority or Core architecture change was introduced.
