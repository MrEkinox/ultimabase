import { applicationFixture } from '../../tests/application-fixture.js'
import { describe, expect, it } from 'vitest'
import { createApplication } from '../application/framework-application.js'
import { plugin as createPlugin, contributeDeclarations } from '../index.js'
import { UltimaBase } from '../runtime/application/ultima-base.js'

describe('plugin schema artifact transformations', () => {
	it('registers all plugin schemas before resolving circular targets', async () => {
		const Left = UltimaBase.Schema.define({
			className: 'PluginCircularLeft',
			fields: (field) => ({
				right: field.pointer({ target: 'PluginCircularRight' }),
			}),
		})
		const Right = UltimaBase.Schema.define({
			className: 'PluginCircularRight',
			fields: (field) => ({
				left: field.pointer({ target: 'PluginCircularLeft' }),
			}),
		})
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.circular-schemas',
			permissions: { 'schema:declare': 'Declares two circular test schemas.' },
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.add({ contributionId: 'left', schema: Left })
						schemas.add({ contributionId: 'right', schema: Right })

						return undefined
					},
				}),
			],
		})

		const application = applicationFixture(
			await createApplication({
				plugins: [plugin],
				schemas: [],
			}),
		)
		await application.dispose()

		expect(application.schemaTargets.get(Left, ['right'])).toBe(Right)
		expect(application.schemaTargets.get(Right, ['left'])).toBe(Left)
	})
})
