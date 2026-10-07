# Core rebuild: TypeScript DX parity pass

Reference snapshot: `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`. Base: `main`
`f0e68cf` (Core integration merge).

Goal: no editor-visible difference (hover, JSDoc, completions, diagnostics)
between the reference and the rebuilt Core, measured with
`node tooling/rebuild/dx-audit.mjs <ref> <rebuild> --only core`
(`docs/rebuild/DX-AUDIT.md`). Type-level declarations that affect display are
restored from the reference; runtime simplifications are kept.

Audit baseline (`--only core`, `f0e68cf`): 335 differences (149 declarations,
8 export hovers, 121 member hovers, 57 usage hovers). Line deltas are
`packages/core` production lines (`tooling/measure-rebuild.mjs`, baseline
58694).

## Causes and restorations

### 1. Field option contracts and compact scalar aliases

Audit 335 → 101; +69 lines.

- Cause: `FieldMetadataOptions` was merged into `FieldOptionsBase`, so every
  `*FieldOptions` member (124 member hovers, plus `VectorFieldOptions` in
  pg-vector) hovered as `FieldOptionsBase<TList, TValue>.description`;
  `FieldOptionsAreCompatible` and the `FieldOptions*` flag aliases were inlined
  (`ValidatedFieldOptions` gained new JSDoc); the per-kind `Resolved*Field`
  aliases were replaced by `ScalarFieldDescriptor`/`CompactScalarField`;
  `ResolvedFieldSourceOptions` replaced the inline source template of
  `CompactScalarFieldFactory`; the enum builder was merged into
  `embedded-field-options.ts`, where `EmbeddedValueOptions<…, 'autoIncrement'>`
  reordered the keys of `EmbeddedIntFieldOptions`/`EmbeddedBigintFieldOptions`.
- Restored: `schema/fields/base/contract.ts` verbatim; the type section of
  `schema/fields/base/factory.ts`; the type aliases (and stray JSDoc) of the 13
  scalar built-ins; `schema/schema/enum-field-builder.ts` and
  `embedded-field-options.ts` verbatim.
- Kept: `createScalarFieldFactory` and each built-in's runtime spec.

### 2. Operation result dispatch

- Cause: `OperationResultFor` dispatched on `{ readonly kind: … }` with new
  `OperationSchema`/`OperationSelectedField`/`OperationObjectResult`/
  `BulkObjectResult` helpers, changing the `OperationResult`,
  `OperationRecordResult` and `OperationSourceRecordResult` hovers.
- Restored: `query/operations/results.ts` and `query/operations/contracts.ts`
  verbatim (the `TOperation extends FindManyOperationAst<infer TSchema …>` chain
  and `CompleteObjectResult`).

### 3. Plugin declaration context

- Cause: `PluginFieldDeclarationContext`/`PluginSchemaDeclarationContext` were
  expressed through `PrivilegedDeclarationContext`, so `PluginDeclarationContext`
  hovered as `PrivilegedDeclarationContext<…>`; `PrivilegeUnion`,
  `SchemaDeclareRequest` and `UnconditionalSchemaDeclareRequest` were gone.
- Restored: the reference privilege type block of `plugins/declaration-host.ts`.
  The runtime simplifications of the host are kept.

### 4. Query inclusion target builder

- Cause: `QueryInclusionTargetBuilder` was redefined as
  `QueryInclusionTargetResult<…, never, never>`, so the `include` shape
  parameter of `QueryBuilder`/`QueryPointerTargetBuilder` printed the result
  alias.
- Restored: `query/query/query-contracts.ts` verbatim.

### 5. Remaining declarations and JSDoc

- Restored: `getFieldListDepth` JSDoc (the validation note moved into the
  body); the reference stray JSDoc blocks above `SchemaOptions` and
  `SchemaCompilationFailureReason`; the inline execution projections of
  `query/operations/schema-commands.ts` (verbatim, no
  `SchemaExecutionProjection`/`SchemaExecutionSelection`); the reference
  selector option aliases of `configured-schema-namespace.ts`; the inline
  source template of `object-field-builder.ts` (verbatim);
  `application/application-handles.ts` verbatim (the private
  `createSchemaMutationMethod` members are part of the class declarations and
  member listing).

Steps 2–5 together: audit 101 → 43; +140 lines with step 6.

### 6. `Simplify` printed as `Simplify$1`

Audit 43 → 0.

- Cause: rolldown-plugin-dts deconflicts the four private `Simplify` aliases by
  declaration module order; the latest module keeps the bare name. The
  reference order is `query/query/result` (`$3`) < `model-contracts` (`$2`) <
  `value-map` (`$1`) < `source-fields` (bare). The rebuild merged
  `source-fields.ts`/`source-nested-writes.ts` into `source-type-info.ts` and
  dropped the declaration import of `./definition.js` from `factory.ts`, so
  `value-map` came last and every query-result hover printed `Simplify$1`
  (also in typegen, roles, hooks, plugin-kit and `tests/e2e` hovers).
- Restored: `schema/schema/source-fields.ts`, `source-nested-writes.ts` and
  `source-type-info.ts` verbatim (`source-filters.ts` imports
  `./source-fields.js` again). `factory.ts` builds its typed snapshot on
  `definition.js`'s `ScalarValueSnapshot`
  (`ScalarValueSnapshot & ((value, path) => TValue)`), which restores the
  declaration import and thus the module order.

## Result

- `--only core`: 0 differences (17856 reference / 17856 rebuild records).
- `packages/core` production: 58694 → 58903 (+209). No `any`, no casts added.
- Tests: none edited.
