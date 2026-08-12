import { describe, expect, it } from 'vitest'
import {
	Schema,
	addSchemaConstraint,
	addSchemaExtension,
	createApplication,
	definePlugin,
	defineSchemaConstraint,
	defineSchemaExtension,
	removeSchemaConstraint,
	removeSchemaExtension,
	replaceSchemaConstraint,
	replaceSchemaExtension,
	stringField,
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

	it('adds and exactly transforms ordered schema extensions with their fields', async () => {
		const originalExtension = defineSchemaExtension(
			'fixture.original-extension',
			{ version: 1 },
			'fixture.extension-owner',
			{ fields: { originalMarker: stringField() } },
		)
		const replacementExtension = defineSchemaExtension(
			'fixture.replacement-extension',
			{ version: 2 },
			'fixture.extension-transformer',
			{ fields: { replacementMarker: stringField() } },
		)
		const addedExtension = defineSchemaExtension(
			'fixture.added-extension',
			{ enabled: true },
			'fixture.extension-transformer',
			{ fields: { addedMarker: stringField() } },
		)
		const Post = Schema.define({
			className: 'ExtensionTransformPost',
			extensions: [originalExtension],
			fields: (field) => ({ title: field.string() }),
		})
		const plugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.extension-transformer',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Adds one extension.',
				},
				{
					name: 'schema:transform',
					reason: 'Replaces one exact extension.',
				},
			] as const,
			version: '4.0.0',
			declare: ({ schemas }) => {
				const post = schemas.select({ className: 'ExtensionTransformPost' })
				schemas.patch({
					operations: [
						replaceSchemaExtension({
							contributionId: 'replacement-extension',
							extension: replacementExtension,
							target: {
								contributionId:
									'extension:ExtensionTransformPost:0:fixture.original-extension',
								expected: originalExtension,
								owner: { kind: 'application' },
							},
						}),
						addSchemaExtension({
							contributionId: 'added-extension',
							extension: addedExtension,
						}),
					],
					targets: post,
				})
			},
		})

		await createApplication({ plugins: [plugin], schemas: [Post] })

		expect(Post.extensions).toEqual([replacementExtension, addedExtension])
		expect(Post.fields.originalMarker).toBeUndefined()
		expect(Post.fields.replacementMarker?.kind).toBe('string')
		expect(Post.fields.addedMarker?.kind).toBe('string')
		expect(Post.provenance.extensions).toMatchObject([
			{ provenance: { contributionId: 'replacement-extension' } },
			{ provenance: { contributionId: 'added-extension' } },
		])

		const Removable = Schema.define({
			className: 'ExtensionRemovalPost',
			extensions: [originalExtension],
			fields: (field) => ({ title: field.string() }),
		})
		const remover = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.extension-remover',
			privileges: [
				{
					name: 'schema:transform',
					reason: 'Removes one exact extension.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.patch({
					operations: [
						removeSchemaExtension({
							contributionId: 'remove-original-extension',
							target: {
								contributionId:
									'extension:ExtensionRemovalPost:0:fixture.original-extension',
								expected: originalExtension,
								owner: { kind: 'application' },
							},
						}),
					],
					targets: schemas.select({ className: 'ExtensionRemovalPost' }),
				})
			},
		})

		await createApplication({ plugins: [remover], schemas: [Removable] })

		expect(Removable.extensions).toEqual([])
		expect(Removable.fields.originalMarker).toBeUndefined()
		expect(Removable.provenance.patches.at(-1)?.kind).toBe('extension:remove')
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
