import { describe, expect, it } from 'vitest'

import {
	createApplication,
	definePlugin,
	definePluginFieldType,
	type PluginFieldTypeDefinition,
} from '../../index.js'

const validDefinition = () => ({
	fieldKind: 'fixture.secret' as const,
	typegen: {
		module: '@fixture/secret-plugin',
		structuralContainsType: 'SecretContainsOperand',
		valueType: 'SecretValue',
	},
})

describe('plugin field type declarations', () => {
	it('snapshots a value contract without exposing a builder method', async () => {
		const input = validDefinition()
		const fieldType = definePluginFieldType(input)
		input.typegen.valueType = 'MutatedValue'
		const application = await createApplication({
			plugins: [
				definePlugin({
					core: '^0.0.0',
					declare: ({ fields }) => {
						fields.declareType(fieldType)
						return undefined
					},
					pluginId: 'fixture.secret-plugin',
					privileges: [
						{
							name: 'schema:declare',
							reason: 'Declares a patch-only fixture field type.',
						},
					],
					version: '0.0.0',
				}),
			],
			schemas: [],
		})

		expect(application.fieldBuilderMethods).toStrictEqual([])
		expect(application.pluginFieldTypes).toStrictEqual([
			{
				fieldKind: 'fixture.secret',
				owner: 'fixture.secret-plugin',
				typegen: {
					module: '@fixture/secret-plugin',
					structuralContainsType: 'SecretContainsOperand',
					valueType: 'SecretValue',
				},
			},
		])
		expect(Object.isFrozen(application.pluginFieldTypes)).toBe(true)
		expect(Object.isFrozen(application.pluginFieldTypes[0]?.typegen)).toBe(true)
	})

	it('rejects invalid and forged definitions at deterministic boundaries', async () => {
		expect(() =>
			definePluginFieldType({
				...validDefinition(),
				// @ts-expect-error -- Runtime validation protects JavaScript callers.
				fieldKind: 'secret',
			}),
		).toThrow('Plugin field type fieldKind must use a namespaced identifier')
		expect(() =>
			definePluginFieldType({
				...validDefinition(),
				typegen: { ...validDefinition().typegen, valueType: 'Secret<Value>' },
			}),
		).toThrow(
			'Plugin field type typegen.valueType must be a TypeScript export identifier',
		)

		const forged = validDefinition() as PluginFieldTypeDefinition
		const plugin = definePlugin({
			core: '^0.0.0',
			declare: ({ fields }) => {
				fields.declareType(forged)
				return undefined
			},
			pluginId: 'fixture.forged-field-type-plugin',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Exercises forged declaration rejection.',
				},
			],
			version: '0.0.0',
		})

		await expect(
			createApplication({ plugins: [plugin], schemas: [] }),
		).rejects.toThrow(
			'Plugin field type from fixture.forged-field-type-plugin must be created by definePluginFieldType',
		)
	})
})
