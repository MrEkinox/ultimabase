# Active plan: explicit Typegen package identity

- Status: active
- Started: 2026-08-10
- Objective owner: `@ultimabase/typegen`, `@ultimabase/core`
- Governing decision: [ADR-0184](docs/adr/0184-typegen-package-identity.md)
- Paused objective: [Generated schema authoring and type contracts](docs/plans/paused/generated-schema-authoring-and-type-contracts.md)

## Objective

Rename the TypeScript-only application contract generator to
`@ultimabase/typegen`, remove the misleading generic Codegen identity, and
prove the unchanged generation lifecycle through source and packed consumers.

## Frozen constraints

- The package becomes `@ultimabase/typegen` in `packages/typegen`.
- The automatic integration is `typegenPlugin()` with Typegen-named public contracts.
- No compatibility package, deprecated export, or old plugin identity remains.
- Precise generator, loader, and writer function names remain unchanged.
- `.ultimabase/schema.generated.d.ts`, declaration shape, and startup timing remain unchanged.
- GraphQL, REST, SDK, migration, client, CLI, watch, and check generation remain out of scope.
- Historical ADRs, completed issues, and archived plans may retain the old name; live surfaces may not.
- Each issue receives a dedicated commit and no push occurs without explicit user confirmation.

## Execution order

1. [x] [1101 — Rename the public Typegen package and plugin API](issues/1100-typegen-package/1101-rename-typegen-package.md)
2. [ ] [1102 — Migrate Typegen terminology and repository documentation](issues/1100-typegen-package/1102-migrate-typegen-terminology.md)
3. [ ] [1103 — Verify source and packed Typegen DX](issues/1100-typegen-package/1103-verify-typegen-dx.md)

## Supervision checkpoints

- During 1101: stop if the rename requires changing generated declaration structure or Core/Runtime execution behavior.
- After 1101: demonstrate that the workspace resolves only `@ultimabase/typegen` and that startup behavior is unchanged.
- After 1102: present the remaining former-name references and justify each as historical.
- After 1103: demonstrate source and packed completions, hovers, startup generation, and clean consumer imports.

## Completion gate

- The repository contains one Typegen package and no Codegen compatibility surface.
- Current applications, examples, diagnostics, and documentation use the new identity.
- Generated declarations and fingerprints retain their established semantics.
- Source and packed language-service tests protect the renamed public API.
- Typecheck, unit/type tests, package archives, lint, constraints, formatting, and build pass.
