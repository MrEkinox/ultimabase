import { expectTypeOf } from 'vitest'

import {
	definePlugin,
	defineTypegenReference,
	type PluginDeclarationContext,
	type CompiledTypegenGraph,
	type TypegenReferenceRegistrar,
} from '../index.js'

const privileges = [
	{ name: 'typegen:reference', reason: 'References one public type.' },
] as const

type Context = PluginDeclarationContext<typeof privileges>
expectTypeOf<
	Context['typegenReferences']
>().toEqualTypeOf<TypegenReferenceRegistrar>()
// Manual declarations and extra output files are no longer plugin powers.
expectTypeOf<Context>().not.toHaveProperty('typegenContributions')
expectTypeOf<Context>().not.toHaveProperty('typegenOutputs')

const reference = defineTypegenReference({
	exportName: 'PublicValue',
	module: '@fixture/public-plugin',
})

definePlugin({
	core: '^0.0.0',
	pluginId: 'fixture.typegen-types',
	version: '1.0.0',
	privileges,
	declare: ({ typegenReferences }) => {
		typegenReferences.register(reference)
	},
})

type NoPrivileges = PluginDeclarationContext<readonly []>
expectTypeOf<NoPrivileges>().not.toHaveProperty('typegenReferences')

// Tooling describes commands; only their original authoring tokens can execute snapshots.
type Operation = CompiledTypegenGraph['operations'][number]['operation']
expectTypeOf<Operation['input']>().not.toHaveProperty('snapshot')
expectTypeOf<Operation['result']>().not.toHaveProperty('snapshot')
type InspectedSchema = CompiledTypegenGraph['schemaSurfaces'][number]['schema']
expectTypeOf<InspectedSchema>().toEqualTypeOf<
	Readonly<{ readonly className: string }>
>()
