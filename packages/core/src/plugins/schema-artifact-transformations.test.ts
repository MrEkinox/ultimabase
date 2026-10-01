import { applicationFixture } from '../../tests/application-fixture.js'
import { describe, expect, it } from 'vitest'
import { createApplication } from '../application/framework-application.js'
import {
	addSchemaConstraint,
	plugin as createPlugin,
	contributeDeclarations,
	defineSchemaConstraint,
} from '../index.js'
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

	it('adds portable schema constraints with owner provenance', async () => {
		const originalConstraint = defineSchemaConstraint({
			kind: 'fixture.search-index',
			value: { fields: ['title'] },
			version: 1,
		})
		const Post = UltimaBase.Schema.define({
			className: 'ConstraintTransformPost',
			fields: (field) => ({
				summary: field.string(),
				title: field.string(),
			}),
		})
		const contributor = (className: string) =>
			createPlugin({
				core: '^0.0.0',
				id: 'fixture.constraint-contributor',
				permissions: {
					'schema:declare': 'Adds one portable logical constraint.',
				},
				version: '1.0.0',
				contributions: [
					contributeDeclarations({
						schema: ({ schemas }) => {
							schemas.patch({
								operations: [
									addSchemaConstraint({
										constraint: originalConstraint,
										contributionId: 'search-index',
									}),
								],
								targets: schemas.select({ className }),
							})

							return undefined
						},
					}),
				],
			})
		await (
			await createApplication({
				plugins: [contributor(Post.className)],
				schemas: [Post],
			})
		).dispose()
		expect(Post.constraints).toEqual([originalConstraint])
		expect(Post.provenance.constraints).toMatchObject([
			{
				provenance: {
					contributionId: 'search-index',
					owner: { kind: 'plugin', pluginId: 'fixture.constraint-contributor' },
				},
			},
		])
	})
})
