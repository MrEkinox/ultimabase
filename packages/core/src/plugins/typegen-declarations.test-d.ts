import { expectTypeOf } from 'vitest'

import {
	definePlugin,
	defineTypegenReference,
	type PluginDeclarationContext,
	type TypegenContributionRegistrar,
	type TypegenOutputRegistrar,
	type TypegenReferenceRegistrar,
} from '../index.js'

const privileges = [
	{ name: 'typegen:reference', reason: 'References one public type.' },
	{ name: 'typegen:contribute', reason: 'Adds one structured declaration.' },
	{ name: 'typegen:emit', reason: 'Emits one separate declaration.' },
] as const

type Context = PluginDeclarationContext<typeof privileges>
expectTypeOf<
	Context['typegenReferences']
>().toEqualTypeOf<TypegenReferenceRegistrar>()
expectTypeOf<
	Context['typegenContributions']
>().toEqualTypeOf<TypegenContributionRegistrar>()
expectTypeOf<
	Context['typegenOutputs']
>().toEqualTypeOf<TypegenOutputRegistrar>()

const reference = defineTypegenReference({
	exportName: 'PublicValue',
	module: '@fixture/public-plugin',
})

definePlugin({
	core: '^0.0.0',
	pluginId: 'fixture.typegen-types',
	version: '1.0.0',
	privileges,
	declare: ({ typegenContributions, typegenOutputs, typegenReferences }) => {
		typegenReferences.register(reference)
		typegenContributions.add({
			contributionId: 'public-value',
			declarations: [
				{
					kind: 'type',
					name: 'ConfiguredPublicValue',
					type: { kind: 'reference', reference },
				},
			],
		})
		typegenOutputs.emit({
			contributionId: 'public-value-output',
			declarations: [
				{
					kind: 'type',
					name: 'PublicValueOutput',
					type: { kind: 'reference', reference },
				},
			],
			kind: 'declaration',
			outputPath: 'public.generated.d.ts',
		})
		typegenOutputs.emit({
			contributionId: 'raw-source',
			// @ts-expect-error -- Typegen emits structured contracts, never raw source.
			contents: 'export const runtimeClient = true',
			kind: 'declaration',
			outputPath: 'runtime-client.js',
		})
	},
})

type NoPrivileges = PluginDeclarationContext<readonly []>
expectTypeOf<NoPrivileges>().not.toHaveProperty('typegenReferences')
expectTypeOf<NoPrivileges>().not.toHaveProperty('typegenContributions')
expectTypeOf<NoPrivileges>().not.toHaveProperty('typegenOutputs')
