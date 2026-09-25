import { expectTypeOf } from 'vitest'

import {
	plugin as createPlugin,
	contributeDeclarations,
	defineTypegenReference,
	type PluginDeclarationContext,
	type CompiledTypegenGraph,
	type TypegenReferenceRegistrar,
} from '../index.js'

type TypegenPrivileges = readonly [
	{ name: 'typegen:reference'; reason: 'References one public type.' },
]

type Context = PluginDeclarationContext<TypegenPrivileges>
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

createPlugin({
	core: '^0.0.0',
	id: 'fixture.typegen-types',
	version: '1.0.0',
	permissions: { 'typegen:reference': 'References one public type.' },
	contributions: [
		contributeDeclarations({
			typegen: ({ typegenReferences }) => {
				typegenReferences.register(reference)

				return undefined
			},
		}),
	],
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
