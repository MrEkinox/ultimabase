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

Every artifact embeds a deterministic SHA-256 fingerprint covering the Core
generated-contract ABI, generator version, application identity, plugin field
contracts, and resolved schema snapshot. `writeGeneratedTypeFile()` writes a
complete sibling temporary file and atomically renames it over the destination.
`writeGeneratedTypeFiles()` additionally rejects duplicate resolved output
paths before writing any file.

The command-line `generate`, `generate --check`, and `generate --watch`
workflows belong to the following CLI issue. This package exposes the
side-effect-free compiler, TypeScript loader, fingerprint, and atomic writer
that those commands will orchestrate.
