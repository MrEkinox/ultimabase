import { describe, expect, it } from 'vitest'
import {
	Schema,
	addSchemaConstraint,
	createApplication,
	definePlugin,
	defineSchemaConstraint,
	removeSchemaConstraint,
	replaceSchemaConstraint,
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

		const application = await createApplication({
			plugins: [plugin],
			schemas: [],
		})

		expect(application.schemaTargets.get(Left, ['right'])).toBe(Right)
		expect(application.schemaTargets.get(Right, ['left'])).toBe(Left)
	})

	it('adds, replaces, and removes exact portable schema constraints', async () => {
		const originalConstraint = defineSchemaConstraint({
			kind: 'fixture.search-index',
			value: { fields: ['title'] },
			version: 1,
		})
		const replacementConstraint = defineSchemaConstraint({
			kind: 'fixture.search-index',
			value: { fields: ['title', 'summary'] },
			version: 2,
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
		const transformer = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.constraint-transformer',
			privileges: [
				{
					name: 'schema:transform',
					reason: 'Replaces one exact portable logical constraint.',
				},
			] as const,
			version: '2.0.0',
			declare: ({ schemas }) => {
				schemas.patch({
					operations: [
						replaceSchemaConstraint({
							constraint: replacementConstraint,
							contributionId: 'replace-search-index',
							target: {
								contributionId: 'search-index',
								expected: originalConstraint,
								owner: {
									kind: 'plugin',
									pluginId: 'fixture.constraint-contributor',
								},
							},
						}),
					],
					targets: schemas.select({ className: 'ConstraintTransformPost' }),
				})
			},
		})

		await createApplication({
			plugins: [contributor('ConstraintTransformPost'), transformer],
			schemas: [Post],
		})

		expect(Post.constraints).toEqual([replacementConstraint])
		expect(Post.provenance.constraints).toMatchObject([
			{
				definition: replacementConstraint,
				provenance: {
					contributionId: 'replace-search-index',
					owner: { pluginId: 'fixture.constraint-transformer' },
				},
			},
		])

		const Removable = Schema.define({
			className: 'ConstraintRemovalPost',
			fields: (field) => ({ title: field.string() }),
		})
		const remover = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.constraint-remover',
			privileges: [
				{
					name: 'schema:transform',
					reason: 'Removes one exact portable logical constraint.',
				},
			] as const,
			version: '1.0.0',
			dependencies: [
				{
					pluginId: 'fixture.constraint-contributor',
					version: '^1.0.0',
				},
			],
			declare: ({ schemas }) => {
				schemas.patch({
					operations: [
						removeSchemaConstraint({
							contributionId: 'remove-search-index',
							target: {
								contributionId: 'search-index',
								expected: originalConstraint,
								owner: {
									kind: 'plugin',
									pluginId: 'fixture.constraint-contributor',
								},
							},
						}),
					],
					targets: schemas.select({ className: 'ConstraintRemovalPost' }),
				})
			},
		})

		await createApplication({
			plugins: [contributor('ConstraintRemovalPost'), remover],
			schemas: [Removable],
		})

		expect(Removable.constraints).toEqual([])
		expect(Removable.provenance.patches.at(-1)?.kind).toBe('constraint:remove')
	})
})
