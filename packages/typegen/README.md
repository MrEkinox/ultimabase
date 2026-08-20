# @ultimabase/typegen

Deterministic generated application contracts for UltimaBase schemas.

The package compiles only the static application graph, converts it to an
inert snapshot, emits one compact TypeScript declaration plus explicitly owned
inert plugin outputs, and replaces each file atomically. It never connects
infrastructure, reads database credentials, serializes callbacks, or emits a
Runtime client.

`typegenPlugin()` declares `environment:filesystem` because it directly loads
application sources and atomically writes generated artifacts. This is an
inspectable and denyable startup claim, not a Core filesystem privilege or an
operating-system sandbox. Typegen has no replacement privilege; its public
plugin powers are the owner-scoped reference, structured contribution, and
inert output boundaries supplied by Core.

## Automatic startup generation

Configure the development tooling once in the application plugin graph:

```ts
import { typegenPlugin } from '@ultimabase/typegen'
import { UltimaBase } from '@ultimabase/core'

const ultimabase = new UltimaBase({
	plugins: [typegenPlugin()],
	schemas: [Todo],
})

await ultimabase.start()
```

Static schema compilation completes first, then `typegenPlugin()` atomically
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
} from '@ultimabase/typegen'

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

### Plugin-owned contracts

Plugins request separate privileges for public type references, structured main
declaration contributions, and separate output:

```ts
const publicState = defineTypegenReference({
	module: '@example/workflow-plugin',
	exportName: 'WorkflowState',
})

definePlugin({
	pluginId: '@example/workflow-plugin',
	version: '1.0.0',
	core: '^0.0.0',
	privileges: [
		{ name: 'typegen:reference', reason: 'References WorkflowState.' },
		{ name: 'typegen:contribute', reason: 'Adds configured workflow types.' },
	],
	declare({ typegenReferences, typegenContributions }) {
		typegenReferences.register(publicState)
		typegenContributions.add({
			contributionId: 'workflow-types',
			declarations: [
				{
					kind: 'type',
					name: 'ConfiguredWorkflow',
					type: { kind: 'reference', reference: publicState },
				},
			],
		})
	},
})
```

The closed type-node format supports primitives, JSON literals, arrays, tuples,
unions, objects, and registered generic references. Raw TypeScript is not
accepted. `typegen:emit` is limited to structured `.d.ts` declarations and
deterministic `.json` metadata; JavaScript, binaries, callbacks, credentials,
connection data, and generated Runtime clients are rejected.

Generic generation reads the final graph and emits plugin-added schemas,
fields, used direct schema and field options, exact namespaced operations,
dynamic schema handles, schema/model commands, and query inputs. Plugin owner,
version, contribution ID, static options, imports, destinations, and contents
all participate in collision checks and fingerprints.

Operation declarations retain exact input, result, and declared public
`PluginError` code unions. Generated application and schema/model handles add
typing and autocomplete to the same runtime `execute()` method; they never emit
an executable client. Portable plugin scalars receive an exact generic
complete-value filter containing only `eq`, `ne`, `in`, `notIn`, and null
predicates; Typegen does not infer ordered or domain-specific operators from a
JSON codec. Portable equality metadata advances the inert snapshot format to
version 4.

The TypeScript loader transpiles the application before a previous generated
registry exists. Static compilation registers configured plugin field methods,
resolves fields and relationship targets, and then emits exact models,
operation inputs, filters, projections, includes, embedded objects, and
FieldBuilder methods. Those values drive exact contextual options contributed
by installed plugins, including official Access and Hooks. Compatible object
and enum `typeName` identities are
reused; incompatible identities and normalized TypeScript name collisions
report both owners.

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
They are contextually inferred from the compiled option contracts rather than repeated as standalone
`TodoAccess` or `TodoHooks` wrappers. Extracted code can name the canonical
generated value or operation input directly.

Each schema also receives a concrete object-shaped `TodoOrderByInput` whose
optional fields use the generated local `OrderDirection` union; generated
application code never exposes the Core ordering helper.

Generated schema commands retain the same named inputs while exposing concise
singular identifier aliases. `updateOne({ id, data })` and `deleteOne({ id })`
are typed as mutually exclusive alternatives to their canonical `where` forms;
Core normalizes the alias to `{ id: { eq: id } }` before Query construction.

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
and Typegen contracts, owners, static options, destinations, and resolved schema
snapshot. `writeGeneratedTypeFile()` writes a
complete sibling temporary file and atomically renames it over the destination.
`writeGeneratedTypeFiles()` additionally rejects duplicate resolved output
paths before writing any file.

Command-line generation, check mode, and watch mode are deferred. They will
allow developers to request generation manually without starting the
application. This package currently exposes automatic startup generation plus
the side-effect-free compiler, TypeScript loader, fingerprint, and atomic
writer for explicit build integrations.
