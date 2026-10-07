# 6313 Typegen inventory

Baseline: `10b55be7`, recorded before production deletion on 2026-10-01.
This inventory distinguishes source-owned authoring from the retained consumers
of the same public plugin contracts. A configured replacement alone is not
proof that a generated declaration has no remaining consumer.

## Generated output and consumers

| Output                                                                                                                             | Classification and current consumer                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema item/output, create/update/nested inputs, select/dependency select/include/order/where, shared filters, enum/object aliases | Retained named graph. Core schema/type-info, Query, relationships, exact User results, complete callbacks, and all WhereInput contracts consume them (ADR-0280/0281/0283/0284).                                                                                                                                       |
| `Schemas` namespace, registry state and schema map                                                                                 | Retained sole name graph. Literal targets, circular/cross-file schemas, rename checks and generated/public imports use it. No alternative registry.                                                                                                                                                                   |
| `ApplicationFieldBuilder`, `ApplicationEmbeddedFieldBuilder`, `ApplicationVirtualFieldBuilder`, `ApplicationOutputBuilder` aliases | Proven duplicate projections selected for removal. The same methods already populate Core's four generated builder-method interfaces. The only handwritten alias consumer is generator-language-service.test.ts; Core.FieldBuilder preserves its vector and named-target checks. Configured callbacks infer directly. |
| Four generated builder-method interfaces                                                                                           | Explicitly retained. Standalone PasswordUserSchema/RoleSchema and Schema.defineSpecialized, plus public low-level builder types, still need these. Removing them previously failed the valid vector canary.                                                                                                           |
| Contextual field/schema option and compatibility interfaces                                                                        | Explicitly retained when a plugin registers them. Standalone/low-level declarations and complete Access/Hooks/ACL callbacks still consume these. Configured locally decidable options infer independently.                                                                                                            |
| `UltimaBaseGeneratedOperations`                                                                                                    | Explicitly retained. application-handles.ts and UltimaBase.operation's dynamic-string overload use it after source receipts are erased; token/configured overloads use source contracts.                                                                                                                              |
| `UltimaBaseGeneratedSchemaSurfaces` methods                                                                                        | Explicitly retained. Advanced schema/model handles, name-based schema classes and persisted results still consume them. Preserve schema-only/model-only visibility.                                                                                                                                                   |
| Surface `schemaMutations` descriptors                                                                                              | Retained complete callback graph. Hooks and Access consume the exact keys, authority, effect, payload, result, selection and declared errors.                                                                                                                                                                         |
| Full mutation definitions repeated inside schemaClass/schema/model methods                                                         | Proven duplicate rendering selected for removal. Methods can index the existing same-schema canonical schemaMutations entry. Core's compileCommandGraph rejects duplicate aliases across both surfaces. No new Core helper or graph is needed.                                                                        |
| Import aliases, generated header and fingerprint                                                                                   | Retained for public nominal references, reproducibility and stale-output detection.                                                                                                                                                                                                                                   |

The four builder aliases are emitted-file exports, not package-root exports.
Removing their duplicate spelling does not remove any builder method or context.
No whole generated interface is currently proven removable without changing a
retained public entry point. In particular, this issue must not claim that
Typegen contains only relationships or that all plugin metadata disappeared.

## Snapshot facts and references

All following fields are retained. Even a fact not printed verbatim can protect
ownership, collision rejection or fingerprint invalidation.

| Snapshot group         | Fields and purpose                                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Application            | applicationId, version, schemas, fieldMethods, options, operations, surfaces: deterministic application identity and graph. privateStorageFingerprint remains opaque; no private collection data is exposed.                                                                   |
| Schema                 | className, fields, virtualFields: named shape; snapshot.ts/schema renderer and graph resolution. Field descriptions carry hover documentation.                                                                                                                                 |
| Field                  | name, path, kind, description, outputOnly, portableEquality, structuralContains, typegen, value: exact fields, output restrictions, safe operators and nested/value shapes. Virtual fields additionally retain select dependencies.                                            |
| Value/typegen metadata | typegen.create/object/update presence, nullable and list; value.kind, enum values/typeName, object fields/typeName, pointer target, relation target/mappedBy, plugin reference: exact values and inputs. Runtime callbacks, validators and storage-only details stay excluded. |
| Field method           | context, fieldKind, method, name, owner, structuralContains, value: context-specific standalone builder projection, scalar filters and ownership. The aliases' removal does not make these unused.                                                                             |
| Option                 | compatibility, contributionId, contexts, name, owner, reference, generic, scope, staticOptions: exact contextual options and compatibility, collision checks and fingerprint.                                                                                                  |
| Operation              | errors, input, name, owner, result, target, transaction, version: dynamic handles and fingerprints; no executable command token is serialized.                                                                                                                                 |
| Schema mutation        | authority, contributionId, effect, errors, input, mutation, name, owner, returning, select, staticOptions, version: canonical callback descriptor and bound methods.                                                                                                           |
| Surface                | className, modelMutations, schemaMutations: exact per-surface visibility and common descriptor union.                                                                                                                                                                          |
| Public reference       | module, exportName: package-root nominal import; registration/ownership checks remain in snapshot/plugin-graph.ts and Core.                                                                                                                                                    |
| Owner                  | pluginId, optional instanceId, version: exact plugin identity, conflict checks and invalidation after reconfiguration.                                                                                                                                                         |

## Privileges, exports and tooling

- `typegen:reference` remains required for consumed public command references.
  No broader privilege replaces it. Field/options references still use their
  existing schema-declaration authority. Typegen's filesystem environmental
  claim remains inspectable and denyable before setup.
- Keep all 28 package-root exports in src/index.ts: error/classification types;
  createTypegenSnapshot; generateApplicationTypes and its two types;
  typegenPlugin and its three types; loader and its options; fingerprint reader,
  both atomic writers and GeneratedTypeFile; all public snapshot/reference/owner
  types. They describe the retained graph, lifecycle or explicit build workflow.
- Keep the loader, plugin setup, writer, deterministic snapshot and imports.
  Startup generation, create-app's clean-checkout generation, public manual
  build integration and JavaScript-without-Typegen execution remain unchanged.
- Update generator format 19 to 20 for changed output/fingerprints. Snapshot
  format 11 and Core generated ABI 20 remain unchanged: no graph fact or
  consumer contract changes.
- Regenerate both tracked declarations: examples/minimal and
  examples/todo-backend. Keep their drift checks and generated-file exclusions.
  Test fixtures that generate declarations dynamically continue using the same
  production generator. Do not remove generated-registry tests to hide a loss.
- Preserve root validate:full, dependency constraints, package export checks,
  Typegen source/built E2E, ownership/collision/fingerprint/writer tests, and
  locked 1/10/50-schema editor/performance gates. No exclusion or threshold change.
- Review Typegen README, website generate-types guide, plugin authoring guide,
  documentation ownership map, target contract and final audit issue. Clarify
  configured-versus-standalone dependencies; no new canonical authoring path.

## Baseline measurements

`yarn measure:simplification` at this revision: 126,454 production lines,
1,739 public package exports, 939,040 built package declaration bytes.
Typegen: 3,415 production lines, 28 package exports, 9,964 declaration bytes.
These package metrics are distinct from generated application-file bytes.

Production generateApplicationTypes on current-typegen-runtime-fixture.mjs,
applicationId `issue-6313`:

| Schemas | Generated bytes | Full mutation definitions | Builder aliases |
| ------- | --------------: | ------------------------: | --------------: |
| 1       |          17,259 |                         0 |               1 |
| 10      |         136,265 |                        90 |               1 |
| 50      |         660,585 |                       490 |               1 |

The hybrid proof's manually reduced registry is not production output and must
not be used as the delivered size reduction. Record actual post-change output,
compiler/editor probes and the complete validation separately in the handoff.
