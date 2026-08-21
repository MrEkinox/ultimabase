# 1902: Add option-owned structural schema contributions

- Status: planned
- Milestone: 19
- Packages: `@ultimabase/core`, `@ultimabase/plugin-kit`, `@ultimabase/typegen`, `@ultimabase/testing`
- Depends on: 1901
- ADR: decision from issue 1901

## Goal

Let one installed plugin's direct schema option deterministically contribute
owned reserved fields without using `SchemaExtension.fields` or teaching Core
about the plugin.

## Acceptance criteria

- [ ] One option definition may declare immutable structural schema contributions through the owner-bound static plugin declaration phase accepted by issue 1901.
- [ ] Contributions are materialized only when the direct option is present and after its value has been normalized by the owning plugin.
- [ ] Added fields use the ordinary schema field contract, validation plans, provenance, persistence planning, model surfaces, and Typegen pipeline.
- [ ] Developer fields, fields contributed by another owner, and Core-reserved fields cannot be shadowed; conflicts fail deterministically before infrastructure starts.
- [ ] Opaque callback-bearing option values never enter callback-free compiler artifacts, while their inert structural contribution remains reproducible in JavaScript and Typegen-free applications.
- [ ] Missing owners, duplicate definitions, forged contribution metadata, malformed fields, stale patches, and incompatible compiler capabilities fail closed.
- [ ] The contract is generic and proves a non-ACL community fixture with application isolation and exact generated types.
- [ ] Public APIs include focused English JSDoc and language-service coverage against source and packed declarations.

## Tests

- [ ] Runtime and type tests cover option presence and absence, normalization, reserved-field inference, ownership, conflicts, immutability, application isolation, and callback-free round trips.
- [ ] Typegen, JavaScript, Typegen-free, conformance, packed-package, and schema-compiler replacement tests cover the new structural contribution.
- [ ] `yarn constraints`, `yarn typecheck`, `yarn test`, `yarn lint`, `yarn format:check`, and `yarn build` pass.

## Out of scope

- Migrating ACL, PostgreSQL, or Roles.
- Supporting arbitrary executable schema transforms during Runtime setup.
- Replacing plugin fields or general schema patches.
