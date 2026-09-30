# ADR-0282: Configure plugin lists through variadic use

- Status: accepted
- Date: 2026-09-30
- Refines: ADR-0279's single-plugin chaining syntax
- Approval: user approved the bounded variadic `use` proof and migration for issue 6317
- Decision issue: [6317](../../issues/6300-source-typed-application-authoring/6317-migrate-plugin-installation-consumers.md)

## Context

ADR-0279 chose immutable `UltimaBase.use(plugin)` chaining as the sole public
installation path. Migrating existing applications exposed legitimate dynamic
plugin lists, including optional transports and test fixtures. Reassigning a
configured factory in a loop does not preserve its exact TypeScript plugin
tuple: its constructor's privilege policy depends on that tuple. Keeping the
constructor `plugins` option or adding a second public adapter would duplicate
installation paths.

## Decision

The existing `use` method accepts zero or more plugin definitions or a spread
list. A call appends its arguments to one flat ordered immutable tuple and
returns one configured factory:

```ts
const Application = UltimaBase.use(databasePlugin(), ...optionalPlugins)
const application = new Application({ schemas: [Post] })
```

Chaining remains valid and equivalent. A fixed tuple retains exact
per-plugin source inference in argument order. An open array necessarily has
only its declared element type, so callers needing exact source surfaces
should use a fixed tuple or individual arguments. An empty spread leaves the
factory unchanged. No plugin declaration or lifecycle work runs during `use`.

The public constructor `plugins` option is removed. `new UltimaBase({ schemas })`
is the zero-plugin case. Runtime constructor validation rejects an unexpected
`plugins` property before plugin effects. Internal `FrameworkApplication`
continues to receive the one compiled flat tuple; this decision does not add a
registry, a new Runtime path, or plugin powers.

## Consequences

- Dynamic and conditional lists use the same public `use` entry point as fixed
  definitions, with no cast or mutable factory loop.
- Plugin order, identity, dependency, privilege, capability, setup, and reverse
  teardown semantics are unchanged.
- Application construction contains instance options only; migration of schema
  authoring and application handles remains in later milestone issues.
