import { applicationFixture } from '../../tests/application-fixture.js'
import { describe, expect, it } from 'vitest'
import {
	Schema,
	addSchemaConstraint,
	createApplication,
	definePlugin,
	defineSchemaConstraint,
} from '../index.js'

describe('plugin schema artifact transformations', () => {
	it('registers all plugin schemas before resolving circular targets', async () => {
		const Left = Schema.define({
			className: 'PluginCircularLeft',
			fields: (field) => ({
				right: field.pointer({ target: 'PluginCircularRight' }),
			}),
		})
		const Right = Schema.define({
			className: 'PluginCircularRight',
			fields: (field) => ({
				left: field.pointer({ target: 'PluginCircularLeft' }),
			}),
		})
		const plugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.circular-schemas',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Declares two circular test schemas.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.add({ contributionId: 'left', schema: Left })
				schemas.add({ contributionId: 'right', schema: Right })
			},
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
		const Post = Schema.define({
			className: 'ConstraintTransformPost',
			fields: (field) => ({
				summary: field.string(),
				title: field.string(),
			}),
		})
		const contributor = (className: string) =>
			definePlugin({
				core: '^0.0.0',
				pluginId: 'fixture.constraint-contributor',
				privileges: [
					{
						name: 'schema:declare',
						reason: 'Adds one portable logical constraint.',
					},
				] as const,
				version: '1.0.0',
				declare: ({ schemas }) => {
					schemas.patch({
						operations: [
							addSchemaConstraint({
								constraint: originalConstraint,
								contributionId: 'search-index',
							}),
						],
						targets: schemas.select({ className }),
					})
				},
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
