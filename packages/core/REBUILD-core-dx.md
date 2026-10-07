# Core rebuild: TypeScript DX parity pass

Reference snapshot: `0ae7767f7b75dd6c640ca547f9ff85b60f46e69d`. Base: `main`
`f0e68cf` (Core integration merge).

Goal: no editor-visible difference (hover, JSDoc, completions, diagnostics)
between the reference and the rebuilt Core, measured with
`node tooling/rebuild/dx-audit.mjs <ref> <rebuild> --only core`
(`docs/rebuild/DX-AUDIT.md`). Type-level declarations that affect display are
restored from the reference; runtime simplifications are kept.

## Causes, restorations and audit deltas

Audit totals are `--only core` differences after each step (baseline 335:
149 declarations, 8 export hovers, 121 member hovers, 57 usage hovers).
Line deltas are `packages/core` production lines (`tooling/measure-rebuild.mjs`,
baseline 58694).

| Step | Cause                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Restored                                                                                                                                                                                                                                                                                                |     Audit | Lines |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | ----: |
| 1    | Field option contracts and compact scalar aliases rewritten (`FieldMetadataOptions` merged into `FieldOptionsBase`, so `*FieldOptions` members hovered as `FieldOptionsBase<…>.description`; `FieldOptionsAreCompatible` and the `FieldOptions*` flag aliases inlined; `ScalarFieldDescriptor`/`CompactScalarField` replacing the per-kind `Resolved*Field` aliases; `ResolvedFieldSourceOptions` replacing the inline source template in `CompactScalarFieldFactory`; enum builder merged into `embedded-field-options.ts` with `EmbeddedValueOptions<…, 'autoIncrement'>` changing key order) | `schema/fields/base/contract.ts` verbatim; the type section of `schema/fields/base/factory.ts`; the type aliases of the 13 scalar built-ins; `schema/schema/enum-field-builder.ts` and `embedded-field-options.ts` verbatim. Runtime kept: `createScalarFieldFactory` and each built-in's runtime spec. | 335 → 101 |   +69 |
