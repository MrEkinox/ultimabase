# @ultimabase/codegen

Deterministic generated application contracts for UltimaBase schemas.

The package compiles only the static application graph, converts it to an
inert snapshot, emits one compact TypeScript declaration, and can replace that
file atomically. It never runs plugin setup, connects infrastructure, reads
database credentials, or serializes Access and hook callbacks.

## Automatic startup generation

Configure the development tooling once in the application plugin graph:

```ts
import { codegenPlugin } from '@ultimabase/codegen'
import { UltimaBase } from '@ultimabase/core'

const ultimabase = new UltimaBase({
	plugins: [codegenPlugin()],
	schemas: [Todo],
})

await ultimabase.start()
```

Static schema compilation completes first, then `codegenPlugin()` atomically
replaces `.ultimabase/schema.generated.d.ts` before any plugin connects to
infrastructure. `applicationId` and `outputPath` remain configurable for
multi-application repositories. Core receives only a neutral read-only static
graph and never depends on this tooling package.

The lower-level API remains available for build integrations and for the future
manual CLI:

```ts
import {
	generateApplicationTypes,
	loadTypegenApplication,
	writeGeneratedTypeFile,
} from '@ultimabase/codegen'

const application = await loadTypegenApplication({
	sourcePath: './src/ultimabase.ts',
	exportName: 'ultimabase',
})

const generated = generateApplicationTypes({
	application,
	applicationId: 'main',
})

await writeGeneratedTypeFile({
	applicationId: 'main',
	contents: generated.contents,
	outputPath: '.ultimabase/schema.generated.d.ts',
})
```

The TypeScript loader transpiles the application before a previous generated
registry exists. Static compilation registers configured plugin field methods,
resolves fields and relationship targets, and then emits exact models,
operation inputs, filters, projections, includes, Access/hook values, embedded
objects, and FieldBuilder methods. Compatible object and enum `typeName`
identities are reused; incompatible identities and normalized TypeScript name
collisions report both owners.

Generated `Select` contracts mark `id` as `id?: true`: every root or nested
model result contains its stable identifier even when the developer selects
only other fields, while `id: false` is rejected by TypeScript. The same
generated `include` types drive exact relationship projections on reads and on
`createOne`, `createMany`, `updateOne`, and `updateMany`.

The emitted file is application-facing rather than an opaque implementation
dump. Concrete named types such as `TodoItem`, `TodoCreateInput`,
`TodoWhereInput`, and `TodoSelect` appear first, followed by one flat `Schemas`
namespace. Each `Schemas.<Name>` type is the source of truth for its item and
operation inputs; there is no duplicate application-wide `TypeInfo` map or
nested per-schema `Item` alias. The lower-level Core augmentation references
those schema types and is isolated in a framework registry section at the
bottom. It adds only logical field kind, list, and relationship metadata that
cannot be recovered safely from the public value types.
Access and hook contracts are derived instead of duplicated in that registry.
Each schema also receives a concrete object-shaped `TodoOrderByInput` whose
optional fields use the generated local `OrderDirection` union; generated
application code never exposes the Core ordering helper.

Listed fields receive concrete element-aware declarations such as
`ArrayStringFilter`, `ArrayIntFilter`, and named enum/object variants. These
filters expose complete-list `eq`/`ne`, `has`, `hasSome`, `hasEvery`,
`isEmpty`, and complete-value null checks without rebuilding field value types
through Core conditionals. Fields are strictly one-dimensional; nested arrays
are represented explicitly by `jsonField()`.

The emitted declaration augments `@ultimabase/core` with one application-owned
schema registry and the configured root and embedded FieldBuilder methods. Keep
that file included by the application's TypeScript project. Core then resolves
exact drafts, results, Query and mutation inputs, Access, hooks, contextual
extensions, indexes, embedded paths, pointers, and relations directly from the
generated contracts. A loaded registry rejects an unknown builder schema with
an actionable diagnostic directing the developer to regenerate through this
package.

Every artifact embeds a deterministic SHA-256 fingerprint covering the Core
generated-contract ABI, generator version, application identity, plugin field
contracts, and resolved schema snapshot. `writeGeneratedTypeFile()` writes a
complete sibling temporary file and atomically renames it over the destination.
`writeGeneratedTypeFiles()` additionally rejects duplicate resolved output
paths before writing any file.

Command-line generation, check mode, and watch mode are deferred. They will
allow developers to request generation manually without starting the
application. This package currently exposes automatic startup generation plus
the side-effect-free compiler, TypeScript loader, fingerprint, and atomic
writer for explicit build integrations.
