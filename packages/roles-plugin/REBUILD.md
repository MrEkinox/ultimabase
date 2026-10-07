# roles-plugin rebuild

Work in progress on branch `rebuild/roles-plugin` (base `8c8bf6e`), following
`docs/rebuild/PROTOCOL.md`. The public entry (`src/index.ts`) is unchanged.

## Checkpoint 1

- Shared helpers: `readRoleRelation` (hierarchy and deletion), `roleQuerySchema`
  (one `SchemaClass` bridge instead of three casts), `NamedRequestSubjectReferenceCleanup`
  from Core instead of a local copy.
- Error classes use parameter properties (same emitted field order).
- `RoleSchema.define()` uses `DeclaredRoleFields`, `RoleResultCapabilities` and
  `RoleSchemaCapabilities` aliases instead of repeating the same intersections.
- Role-name operation normalization moved next to `normalizeRoleName`.

Production lines: 2192 before, 2015 at checkpoint 2 (one relation-command factory, table-free operation normalization).
