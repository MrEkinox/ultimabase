# Milestone 8 — Generated schema authoring and developer tooling

Replace recursively inferred application schema contracts with deterministic
generated types and a Nexus-style field declaration builder. This milestone is
foundational developer tooling rather than an optional transport or database
feature.

Static TypeScript declarations remain authoritative. Plugins contribute pure
field-method declarations before Core resolves schema callbacks, while the
generated registry gives TypeScript compact application-specific model, Query,
mutation, Access, hook, object, pointer, and relation contracts.

[ADR-0173](../../docs/adr/0173-generated-schema-authoring.md) governs the
declaration, static-compilation, isolation, and generated-cache boundaries.

## Execution order

1. [801 — Prove deferred schema compilation and typegen bootstrap](801-deferred-schema-typegen-proof.md)
2. [802 — Decide generated schema authoring architecture](802-generated-schema-authoring-adr.md)
3. [803 — Compile deferred schema field declarations](803-deferred-schema-field-compilation.md)
4. [804 — Add the Nexus-style FieldBuilder](804-nexus-field-builder.md)
5. [805 — Register plugin-owned FieldBuilder methods](805-plugin-field-builder-methods.md)
6. [806 — Generate compact application schema types](806-compact-schema-typegen.md)
7. [807 — Drive public schema APIs from generated contracts](807-generated-public-schema-contracts.md)
8. [809 — Migrate schema declarations to FieldBuilder](809-field-builder-repository-migration.md)
9. [811 — Generate one-dimensional field-list filters](811-one-dimensional-list-filters.md)
10. [810 — Verify generated schema authoring DX and performance](810-generated-schema-dx-verification.md)

[808 — Add schema generation commands and watch mode](808-typegen-cli-watch-start.md)
is deferred and no longer blocks this milestone.

The exact active sequence, frozen constraints, and supervision checkpoints live
in [`CURRENT_PLAN.md`](../../CURRENT_PLAN.md).
