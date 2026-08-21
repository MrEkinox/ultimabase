# 2005: Prove validator interoperability and generated DX

- Status: planned
- Milestone: 20
- Packages: `@ultimabase/core`, `@ultimabase/typegen`, `@ultimabase/testing`, examples
- Depends on: 2004
- ADR: decision from issue 2001

## Goal

Prove that real Standard Schema implementations compose with field authoring,
generated registries, JavaScript applications, and published Core declarations
without selecting a framework validator.

## Acceptance criteria

- [ ] At least Zod and one independently implemented Standard Schema library pass the same source and packed-package field-validation conformance cases.
- [ ] Scalar, list, object, temporal, decimal, enum, JSON, binary, pointer, and plugin-field examples receive exact contextual validator types without widening generated models.
- [ ] Incompatible validator inputs and outputs fail on the `validation` property with focused TypeScript diagnostics.
- [ ] Direct `required`, `precision`, and `scale` retain exact autocomplete and hover documentation with and without an active generated schema registry.
- [ ] Typegen omits opaque validators from generated declarations and deterministic fingerprints while retaining exact field inputs, outputs, relationships, plugin options, and application isolation.
- [ ] JavaScript and Typegen-free applications execute the same Runtime validation behavior from the compiled application graph.
- [ ] The Todo example demonstrates direct presence, direct decimal shape, one scalar validator, one complete list or object validator, resulting diagnostics, and unchanged generated model types.
- [ ] Published package dependencies contain `@standard-schema/spec` where public declarations require it and contain no concrete validator.
- [ ] Reusable conformance support removes real duplication without making one library's API part of UltimaBase.

## Tests

- [ ] Source and packed language-service tests cover completions, hovers, inference, diagnostics, and generated registry behavior.
- [ ] Runtime, Typegen, JavaScript, Typegen-free, package-archive, and application-isolation tests run the same fixtures with both selected validators.
- [ ] `yarn constraints`, `yarn typecheck`, `yarn test`, `yarn lint`, `yarn format:check`, `yarn build`, and `yarn test:pack` pass.

## Out of scope

- Re-exporting or recommending one validator as mandatory.
- A validator adapter registry or UltimaBase-specific schema builder.
- Benchmarks unrelated to field validation or generated editor behavior.
