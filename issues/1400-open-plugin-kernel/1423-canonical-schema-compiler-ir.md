# 1423: Run the canonical schema compiler through the public IR

- Status: completed
- Milestone: 14
- Packages: `@ultimabase/core`
- Depends on: 1406, 1419, 1422
- ADR: ADR-0187, ADR-0192, ADR-0196

## Goal

Make Core's current schema compiler consume and return the public callback-free
IR so the canonical implementation no longer depends on a privileged transform
path unavailable to a compatible replacement.

## Acceptance criteria

- [x] Static preparation emits one IR input after authorized declaration callbacks and owner-defined option normalization execute exactly once.
- [x] The canonical compiler applies additions, frozen selectors, option ownership, patches, provenance, and relationship declarations only from that IR.
- [x] Canonical IR output decodes through the application-local artifact table and passes the same public output validation reserved for replacements.
- [x] The existing `SchemaCompilationTransformer` callback and direct `PreparedSchemaCompilation` transform path are removed from production and public exports.
- [x] Typegen and JavaScript observe the same decoded graph, and static compilation remains terminal, deterministic, repeatable, and atomic.
- [x] Existing schema declaration behavior and diagnostics remain compatible unless the IR exposes a previously hidden malformed contract.

## Tests

- [x] Existing schema declaration, option, patch, relationship, provenance, isolation, and atomicity suites pass through the IR path.
- [x] Focused tests prove callback execution counts, deterministic IR compilation, output revalidation, and absence of an internal bypass.

## Out of scope

- Schema compiler capability replacement; issue 1418 owns it.
- New schema patch behavior, dynamic handles, Typegen rendering, or persistence compilation.
