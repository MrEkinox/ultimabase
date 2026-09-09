import {
	defineFieldBuilderMethod,
	defineFieldOption,
	definePlugin,
	FrameworkApplication,
	stringField,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { generateApplicationTypes } from './generator.js'

describe('contextual Typegen declarations', () => {
	it('emits two plugins only into their declared contextual interfaces', () => {
		const firstMethod = defineFieldBuilderMethod({
			name: 'firstContextual',
			contexts: {
				output: {
					factory: stringField,
					fieldKind: 'fixture.first-output',
					typegen: {
						methodType: 'FirstOutputBuilderMethod',
						module: '@fixture/first-contextual-plugin',
						valueType: 'FirstOutputValue',
					},
				},
				stored: {
					factory: stringField,
					fieldKind: 'fixture.first-stored',
					typegen: {
						methodType: 'FirstStoredBuilderMethod',
						module: '@fixture/first-contextual-plugin',
						valueType: 'FirstStoredValue',
					},
				},
			},
		})
		const secondMethod = defineFieldBuilderMethod({
			name: 'secondContextual',
			contexts: {
				embedded: {
					factory: stringField,
					fieldKind: 'fixture.second-embedded',
					typegen: {
						methodType: 'SecondEmbeddedBuilderMethod',
						module: '@fixture/second-contextual-plugin',
						valueType: 'SecondEmbeddedValue',
					},
				},
				virtual: {
					factory: stringField,
					fieldKind: 'fixture.second-virtual',
					typegen: {
						methodType: 'SecondVirtualBuilderMethod',
						module: '@fixture/second-contextual-plugin',
						valueType: 'SecondVirtualValue',
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
		const firstPlugin = definePlugin({
			core: '^0.0.0',
			declare: ({ fields, schemas }) => {
				fields.register(firstMethod)
				schemas.defineOptions({
					contributionId: 'firstOption-declaration',
					field: { firstOption },
				})
			},
			pluginId: 'fixture.first-contextual-plugin',
			privileges: [
				{ name: 'schema:declare', reason: 'Declares contextual fixtures.' },
			],
			version: '1.0.0',
		})
		const secondPlugin = definePlugin({
			core: '^0.0.0',
			declare: ({ fields, schemas }) => {
				fields.register(secondMethod)
				schemas.defineOptions({
					contributionId: 'secondOption-declaration',
					field: { secondOption },
				})
			},
			pluginId: 'fixture.second-contextual-plugin',
			privileges: [
				{ name: 'schema:declare', reason: 'Declares contextual fixtures.' },
			],
			version: '1.0.0',
		})
		const application = new FrameworkApplication({
			plugins: [firstPlugin, secondPlugin],
			schemas: [],
		})

		const generated = generateApplicationTypes({
			application,
			applicationId: 'fixture.contextual',
		})

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
