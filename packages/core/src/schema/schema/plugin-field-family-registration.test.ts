import { applicationFixture } from '../../../tests/application-fixture.js'
import { describe, expect, it } from 'vitest'

import {
	definePluginFieldFamily,
	type PluginFieldFamilyDefinition,
} from '../../index.js'
import { plugin as createPlugin, contributeDeclarations } from '../../plugin.js'
import { createApplication } from '../../application/framework-application.js'

const validDefinition = () => ({
	fieldKind: 'fixture.secret' as const,
})

describe('plugin field family registration', () => {
	it('registers a field kind without a builder method', async () => {
		const family = definePluginFieldFamily(validDefinition())
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
