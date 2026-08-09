# @ultimabase/codegen

Deterministic generated application contracts for UltimaBase schemas.

The package compiles only the static application graph, converts it to an
inert snapshot, emits one compact TypeScript declaration, and can replace that
file atomically. It never runs plugin setup, connects infrastructure, reads
database credentials, or serializes Access and hook callbacks.

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

Command-line generation, watch mode, and startup verification are deferred.
This package currently exposes the side-effect-free compiler, TypeScript
loader, fingerprint, and atomic writer for explicit build integrations and
repository-owned generation scripts.
