import {
	definePluginFieldFamily,
	UltimaBase,
	stringField,
} from '@ultimabase/core'
import {
	defineFieldOption,
	plugin,
	contributeDeclarations,
} from '@ultimabase/core/plugin'
import { describe, expect, it } from 'vitest'

import { generateApplicationTypes } from './generator.js'

describe('contextual Typegen declarations', () => {
	it('emits two plugins only into their declared contextual interfaces', () => {
		const firstMethod = definePluginFieldFamily({
			fieldKind: 'fixture.first-output',
			typegen: {
				module: '@fixture/first-contextual-plugin',
				valueType: 'FirstOutputValue',
			},
			builder: {
				name: 'firstContextual',
				contexts: {
					output: {
						factory: stringField,
						methodType: 'FirstOutputBuilderMethod',
					},
					stored: {
						factory: stringField,
						fieldKind: 'fixture.first-stored',
						methodType: 'FirstStoredBuilderMethod',
						typegen: {
							module: '@fixture/first-contextual-plugin',
							valueType: 'FirstStoredValue',
						},
					},
				},
			},
		})
		const secondMethod = definePluginFieldFamily({
			fieldKind: 'fixture.second-embedded',
			typegen: {
				module: '@fixture/second-contextual-plugin',
				valueType: 'SecondEmbeddedValue',
			},
			builder: {
				name: 'secondContextual',
				contexts: {
					embedded: {
						factory: stringField,
						methodType: 'SecondEmbeddedBuilderMethod',
					},
					virtual: {
						factory: stringField,
						fieldKind: 'fixture.second-virtual',
						methodType: 'SecondVirtualBuilderMethod',
						typegen: {
							module: '@fixture/second-contextual-plugin',
							valueType: 'SecondVirtualValue',
						},
					},
				},
			},
		})
		const firstOption = defineFieldOption({
			contexts: ['stored', 'output'],
			normalize: (value) => Boolean(value),
			protocolVersion: 1,
			typegen: {
				module: '@fixture/first-contextual-plugin',
				type: 'FirstContextualOption',
			},
		})
		const secondOption = defineFieldOption({
			contexts: ['embedded', 'virtual'],
			normalize: (value) => Boolean(value),
			protocolVersion: 1,
			typegen: {
				module: '@fixture/second-contextual-plugin',
				type: 'SecondContextualOption',
			},
		})
		const firstPlugin = plugin({
			core: '^0.0.0',
			id: 'fixture.first-contextual-plugin',
			permissions: { 'schema:declare': 'Declares contextual fixtures.' },
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ fields, schemas }) => {
						fields.register(firstMethod)
						schemas.defineOptions({
							contributionId: 'firstOption-declaration',
							field: { firstOption },
						})

						return undefined
					},
				}),
			],
		})
		const secondPlugin = plugin({
			core: '^0.0.0',
			id: 'fixture.second-contextual-plugin',
			permissions: { 'schema:declare': 'Declares contextual fixtures.' },
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ fields, schemas }) => {
						fields.register(secondMethod)
						schemas.defineOptions({
							contributionId: 'secondOption-declaration',
							field: { secondOption },
						})

						return undefined
					},
				}),
			],
		})
		const application = new (UltimaBase.use(firstPlugin, secondPlugin))({
			schemas: [],
		})

		const generated = generateApplicationTypes({
			ultimabase: application,
			applicationId: 'fixture.contextual',
		})

		// Core's contextual interfaces already carry every registered method.
		expect(generated.contents).not.toMatch(
			/export type Application(?:FieldBuilder|EmbeddedFieldBuilder|VirtualFieldBuilder|OutputBuilder)/u,
		)

		expect(
			generated.snapshot.fieldMethods.map(({ context, name }) => ({
				context,
				name,
			})),
		).toStrictEqual([
			{ context: 'stored', name: 'firstContextual' },
			{ context: 'output', name: 'firstContextual' },
			{ context: 'embedded', name: 'secondContextual' },
			{ context: 'virtual', name: 'secondContextual' },
		])
		expect(generated.contents).toMatch(
			/interface UltimaBaseGeneratedFieldBuilderMethods \{\s+readonly firstContextual:/u,
		)
		expect(generated.contents).toMatch(
			/interface UltimaBaseGeneratedEmbeddedFieldBuilderMethods \{\s+readonly secondContextual:/u,
		)
		expect(generated.contents).toMatch(
			/interface UltimaBaseGeneratedVirtualFieldBuilderMethods \{\s+readonly secondContextual:/u,
		)
		expect(generated.contents).toMatch(
			/interface UltimaBaseGeneratedOutputBuilderMethods \{\s+readonly firstContextual:/u,
		)
		expect(generated.contents).toMatch(
			/interface UltimaBaseGeneratedFieldOptions \{\s+readonly firstOption\?:/u,
		)
		expect(generated.contents).toMatch(
			/interface UltimaBaseGeneratedEmbeddedFieldOptions \{\s+readonly secondOption\?:/u,
		)
		expect(generated.contents).toMatch(
			/interface UltimaBaseGeneratedVirtualFieldOptions \{\s+readonly secondOption\?:/u,
		)
		expect(generated.contents).toMatch(
			/interface UltimaBaseGeneratedOutputOptions \{\s+readonly firstOption\?:/u,
		)
	})
})
