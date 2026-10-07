# ADR-0184: Type generation uses an explicit package identity

- Status: accepted
- Date: 2026-08-10
- Refines: ADR-0173, ADR-0175, ADR-0177

## Context

`@ultimabase/codegen` emits only the TypeScript contracts derived from one
statically compiled application. Its name suggests a general code-generation
platform that could also own GraphQL, REST, clients, migrations, or other
artifacts. Those capabilities have separate architectural owners and must not
be implied by this package.

The repository is still in development and the package has no compatibility
contract requiring a deprecated alias.

## Decision

The tooling package is renamed from `@ultimabase/codegen` to
`@ultimabase/typegen`, and its workspace directory becomes `packages/typegen`.
Its automatic application integration is renamed from `codegenPlugin()` to
`typegenPlugin()`. Public plugin contracts follow the same terminology:
`TypegenPlugin` and `TypegenPluginOptions`.

The package does not use the `-plugin` suffix because it owns the standalone
generator, loader, snapshot, and writer APIs; its plugin factory is one startup
integration for that broader development tool rather than its sole capability.

Already precise APIs keep their names:

- `generateApplicationTypes()`;
- `generateApplicationTypesFromSnapshot()`;
- `loadTypegenApplication()`;
- `writeGeneratedTypeFile()` and `writeGeneratedTypeFiles()`.

The default output remains `.ultimabase/schema.generated.d.ts`. Generated
banners, diagnostics, plugin identity, package metadata, examples, and current
documentation use `@ultimabase/typegen` exclusively.

The rename is immediate. Core and the workspace expose no compatibility package,
deprecated re-export, or `codegenPlugin()` alias. Historical accepted ADRs,
completed issues, and archived plans may retain the former name when describing
the state that existed at the time.

## Consequences

- Developers can distinguish TypeScript contract generation from future
  GraphQL, transport, client, or migration generation.
- Runtime behavior, generated declaration structure, fingerprint semantics,
  startup ordering, and output paths do not change.
- Applications must update their package import and plugin factory name once.
- Future manual commands and documentation use the `typegen` vocabulary.
