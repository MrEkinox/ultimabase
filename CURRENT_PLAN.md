# Active plan: generated schema authoring and type contracts

- Status: active
- Started: 2026-08-09
- Objective owner: `@ultimabase/core`, `@ultimabase/codegen`, `@ultimabase/pg-vector-plugin`
- Governing decision: [ADR-0173](docs/adr/0173-generated-schema-authoring.md)
- Paused objective: [ACL hardening and developer-experience consolidation](docs/plans/paused/acl-hardening-and-developer-experience-consolidation.md)

## Objective

Replace application-facing field maps and recursively inferred public types with
a Nexus-style declaration builder plus deterministic generated application
types. Plugins must be able to contribute methods such as `field.vector()`
without Core naming the field kind, using one declaration phase before schema
fields are resolved.

The target developer experience is:

```ts
const Document = Schema.define({
	className: 'Document',
	fields(field) {
		field.string('title', {
			validation: { required: true },
		})
		field.vector('embedding', {
			dimensions: 1536,
		})
	},
})
```

The developer installs and configures the vector plugin, then generates the
application contract through `@ultimabase/codegen`. The first unresolved plugin
method may be temporarily reported by TypeScript; successful generation adds
its exact method and schema types. A future CLI may automate generation, watch,
and startup verification, but those commands are deliberately outside this
active milestone.

## Frozen constraints

- Static TypeScript schema declarations remain the source of truth; generated files are deterministic caches.
- Core never names a plugin field method or imports its implementation.
- Plugin declaration contributions are synchronous, pure, deterministic, owner-scoped, and application-local.
- Schema field callbacks resolve only after plugin field methods have been registered.
- Public generated declarations use compact named types instead of reproducing the current recursive conditional inference graph.
- Generated output contains no database credentials, runtime request state, Drizzle metadata, or executable business callbacks.
- Missing plugins, duplicate field methods, incompatible generated identities, and stale output fail explicitly.
- The first implementation regenerates the complete application graph; incremental generation requires later measured evidence.
- `field.custom()` is not introduced as the normal application DX.
- Existing field factories remain the implementation foundation and plugin-author contract until a later decision explicitly narrows their exports.
- Internal tests and framework-owned composition may retain field maps for local inference; ordinary application documentation uses FieldBuilder.
- Embedded objects remain value trees: pointers, relations, and database-generated sequences stay top-level.
- Every issue receives its own commit and no push occurs without explicit user confirmation.

## Execution order

### Phase 0 — Blocking proof and decision

1. [x] [801 — Prove deferred schema compilation and typegen bootstrap](issues/800-generated-types/801-deferred-schema-typegen-proof.md)
2. [x] [802 — Decide generated schema authoring architecture](issues/800-generated-types/802-generated-schema-authoring-adr.md)

Issue 801 is a stop point. Production implementation must not begin unless the
prototype preserves the agreed model-construction and application-isolation
semantics and the user validates the demonstrated editor behavior.

### Phase 1 — Static compilation foundation

3. [x] [803 — Compile deferred schema field declarations](issues/800-generated-types/803-deferred-schema-field-compilation.md)
4. [x] [804 — Add the Nexus-style FieldBuilder](issues/800-generated-types/804-nexus-field-builder.md)
5. [x] [805 — Register plugin-owned FieldBuilder methods](issues/800-generated-types/805-plugin-field-builder-methods.md)

### Phase 2 — Generated application contracts

6. [x] [806 — Generate compact application schema types](issues/800-generated-types/806-compact-schema-typegen.md)
7. [x] [807 — Drive public schema APIs from generated contracts](issues/800-generated-types/807-generated-public-schema-contracts.md)

### Deferred — Commands and continuous regeneration

- [ ] [808 — Add schema generation commands and watch mode](issues/800-generated-types/808-typegen-cli-watch-start.md) — deferred by product decision on 2026-08-09

### Phase 3 — Repository migration

9. [x] [809 — Migrate schema declarations to FieldBuilder](issues/800-generated-types/809-field-builder-repository-migration.md)

### Phase 4 — Final proof

10. [ ] [810 — Verify generated schema authoring DX and performance](issues/800-generated-types/810-generated-schema-dx-verification.md)

## Supervision checkpoints

- After 801: demonstrate `field.vector()`, first-generation bootstrap, exact Access/hooks typing, nested objects, relations, model construction, and two isolated applications.
- After 802: present the ADR and the deliberate non-goals before production code.
- After 805: demonstrate runtime field resolution and missing/conflicting plugin failures.
- After 807: demonstrate source and packed-package autocomplete for Query, mutations, Access, hooks, objects, pointers, and relations.
- After 809: review the public API examples while retaining field maps only for internal tests and framework-owned composition.

## Completion gate

- Every active issue and dependency is complete with a dedicated commit; deferred issue 808 remains outside this gate.
- One deterministic generated registry powers field methods and public schema operation types without `any`.
- TypeScript stable releases receive exact completions without depending on TypeScript 7-only contextual behavior.
- A representative large-schema fixture records typecheck time, completion latency, hover quality, and TypeScript process memory before and after migration.
- Core, plugin, packed-package, PostgreSQL E2E, typecheck, test, lint, formatting, constraints, and build checks pass.
- Documentation describes explicit first generation, stale output, plugin removal, and read-only consumption while naming automatic watch and startup regeneration as deferred.
