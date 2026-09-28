import { applicationFixture } from '../../../tests/application-fixture.js'
import { describe, expect, it } from 'vitest'

import {
	plugin as createPlugin,
	contributeDeclarations,
	definePluginFieldFamily,
	type PluginFieldFamilyDefinition,
} from '../../index.js'
import { createApplication } from '../../application/framework-application.js'

const validDefinition = () => ({
	fieldKind: 'fixture.secret' as const,
	typegen: {
		module: '@fixture/secret-plugin',
		structuralContainsType: 'SecretContainsOperand',
		valueType: 'SecretValue',
	},
})

describe('plugin field family registration', () => {
	it('registers a generated value contract without a builder method', async () => {
		const input = validDefinition()
		const family = definePluginFieldFamily(input)
		input.typegen.valueType = 'MutatedValue'
		const application = applicationFixture(
			await createApplication({
				plugins: [
					createPlugin({
						core: '^0.0.0',
						id: 'fixture.secret-plugin',
						permissions: {
							'schema:declare': 'Declares a patch-only fixture field type.',
						},
						version: '0.0.0',
						contributions: [
							contributeDeclarations({
								schema: ({ fields }) => {
									fields.register(family)
									return undefined
								},
							}),
						],
					}),
				],
				schemas: [],
			}),
		)
		await application.dispose()

		expect(application.fieldBuilderMethods).toStrictEqual([])
		expect(application.pluginFieldTypes).toStrictEqual([
			{
				fieldKind: 'fixture.secret',
				owner: 'fixture.secret-plugin',
				typegen: validDefinition().typegen,
			},
		])
		expect(Object.isFrozen(application.pluginFieldTypes[0]?.typegen)).toBe(true)
	})

	it('rejects forged definitions at the owner boundary', async () => {
		const forged = validDefinition() as PluginFieldFamilyDefinition
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.forged-field-family-plugin',
			permissions: {
				'schema:declare': 'Exercises forged declaration rejection.',
			},
			version: '0.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ fields }) => {
						fields.register(forged)
						return undefined
					},
				}),
			],
		})

		await expect(
			createApplication({ plugins: [plugin], schemas: [] }),
		).rejects.toThrow(
			'Plugin field family from fixture.forged-field-family-plugin must be created by definePluginFieldFamily',
		)
	})
})
