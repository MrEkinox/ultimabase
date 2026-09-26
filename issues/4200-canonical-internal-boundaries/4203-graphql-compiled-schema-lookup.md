# 4203: Centralize GraphQL compiled-schema lookup

- Status: completed
- Milestone: 42
- Packages: `@ultimabase/graphql-plugin`
- Depends on: 4202
- ADR: ADR-0238

## Goal

Make GraphQL field, filter, connection, and mutation compilers share private
readers for required schema surfaces and compiled relationship targets.

## Acceptance criteria

- [x] Repeated surface and target lookup guards use private package helpers.
- [x] GraphQL names, ownership, target resolution, and exact failures remain unchanged.
- [x] No public export or compiler protocol is added.
- [x] Handwritten production lines decrease and focused parity tests pass.
- [x] Documentation impact is recorded.

## Out of scope

- Changing the generated GraphQL schema or naming rules.
- Combining compiler classes or caches.
- Changing relationship or mutation semantics.

## Outcome

Field, filter, structural-filter, connection, and mutation compilers now share
one private lookup object for required GraphQL surfaces and relationship
targets. Nested compilers receive the same lookup instead of rebuilding it.
Generated names and exact missing-surface or missing-target errors remain
unchanged while handwritten production code decreases by 19 lines.

## Validation

- `yarn workspace @ultimabase/graphql-plugin typecheck`
- `yarn vitest run --project unit packages/graphql-plugin/src/compiler.test.ts packages/graphql-plugin/src/virtual-schema.test.ts packages/graphql-plugin/src/read-input-compiler.test.ts`
- `yarn eslint packages/graphql-plugin/src/compiled-schema-lookup.ts packages/graphql-plugin/src/field-compiler.ts packages/graphql-plugin/src/mutation-input-compiler.ts packages/graphql-plugin/src/connection-types.ts packages/graphql-plugin/src/filter-input-compiler.ts packages/graphql-plugin/src/filter-structural-input-compiler.ts`
- `git diff --check`

## Documentation impact

Internal engineering documentation. The generated schema, public options, and
GraphQL errors are unchanged, so the public website and package README remain
accurate; this issue records the private consolidation.
