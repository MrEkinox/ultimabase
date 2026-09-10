# 2608: Create the official soft-delete package and schema contract

- Status: completed
- Milestone: 26
- Packages: `@ultimabase/soft-delete-plugin`, `@ultimabase/typegen`
- Depends on: 2602, 2615
- ADR: [ADR-0245](../../docs/adr/0245-plugin-schema-mutations-and-soft-delete.md), [ADR-0246](../../docs/adr/0246-schema-option-absence-and-static-plugin-powers.md)

## Goal

Create the official package with one deterministic plugin configuration and one
direct per-schema option, without installing policy, lifecycle, database, or
transport providers.

## Acceptance criteria

- [x] The publishable workspace and package are named
      `packages/soft-delete-plugin` and `@ultimabase/soft-delete-plugin` and
      follow repository exports, build, lint, archive, and release conventions.
- [x] `softDeletePlugin({ defaultMode })` accepts `disabled`,
      `replace-delete`, or `explicit`; omission normalizes safely to `disabled`.
- [x] Schemas accept `softDelete: false | 'replace-delete' | 'explicit'`;
      omission inherits the plugin default and direct `false` always disables
      the feature.
- [x] Configuration has no `schemas` allowlist, mutable selector callback,
      environment dependency, adapter option, Access option, or Hooks option.
- [x] The plugin declares the smallest fixed truthful set of potential
      privileges and deterministic capabilities required by its accepted modes;
      effective schema contributions remain conditional and may compile to an
      empty application-local plan.
- [x] Multiple explicit plugin instances reject ambiguous ownership of the same
      schema while distinct applications remain isolated.
- [x] Typegen contributes the direct schema option without becoming Runtime
      truth; model surfaces are added only with their executable behavior in
      issues 2611 and 2612.
- [x] Public JSDoc and the package README explain inheritance, both modes,
      optional official integrations, protected storage, and v1 exclusions.

## Tests

- [x] Option, declaration, privilege, conflict, two-instance, JavaScript,
      Typegen, language-service, package-export, archive, and import-side-effect
      tests pass.
- [x] Stale or untyped invalid modes and schema options fail before setup or
      infrastructure effects.

## Evidence

- `yarn workspace @ultimabase/soft-delete-plugin typecheck`
- `yarn vitest run --project unit --project types packages/soft-delete-plugin`
- `yarn workspace @ultimabase/soft-delete-plugin build`
- `yarn vitest run --project e2e tests/e2e/soft-delete-plugin.e2e.test.ts tests/e2e/official-plugin-manifests.e2e.test.ts tests/e2e/optional-product-public-api.e2e.test.ts tests/e2e/package-archives.e2e.test.ts`
- `yarn constraints`
- `yarn format:check`
- `yarn check:issues`
- `yarn typecheck`
- `yarn test`
- `yarn build`
- Core, package, and workspace ESLint partitions pass with the existing
  centralized line-budget warnings; the package and workspace partitions use
  an 8 GiB Node heap because the default 4 GiB process exhausts memory on this
  checkout.

## Out of scope

- Tombstone behavior, persistence rewrites, transport routes, or administration.
