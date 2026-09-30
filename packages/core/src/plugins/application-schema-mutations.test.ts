import { describe, expect, it } from 'vitest'

import { UltimaBase } from '../runtime/application/ultima-base.js'
import { bindApplicationSchemaModel } from '../application/application-model-views.js'
import { materializeSchemaModel } from '../schema/schema/model-materialization.js'
import { Schema } from '../schema/schema/definition.js'
import { plugin as createPlugin } from './plugin.js'
import { contributeDeclarations } from './plugin-contributions.js'

import { defineOperationValue } from './plugin-operations.js'
import { defineSchemaMutation } from './plugin-schema-mutations.js'

const WorkflowPost = Schema.define({
	className: 'SchemaMutationWorkflowPost',
	fields: (field) => ({
		title: field.string(),
		workflowState: field.string(),
	}),
})

const archive = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	errors: ['fixture.workflow.archive-rejected'] as const,
	input: defineOperationValue((value, path) => {
		if (typeof value !== 'string') {
			throw new TypeError(`${path} must be a string`)
		}
		return value
	}),
	name: 'fixture.workflow.archive',
	returning: 'after',
	select: { workflowState: true },
	version: '1.0.0',
})

const workflowPlugin = createPlugin({
	core: '^0.0.0',
	id: 'fixture.schema-mutation-workflow',
	permissions: {
		'model:extend': 'Adds the archive mutation.',
		'operation:declare': 'Declares the archive mutation.',
	},
	version: '1.0.0',
	contributions: [
		contributeDeclarations({
			operations: ({ operations }) => {
				operations.declare(archive)
				return undefined
			},
			models: ({ models }) => {
				models.extend(WorkflowPost, {
					contributionId: 'workflow-mutations',
					schemaMutations: {
						archive: { mutation: archive, surfaces: ['schema', 'model'] },
					},
				})
				return undefined
			},
		}),
	],
})

describe('application-owned schema mutations', () => {
	it('compiles callback-free descriptors and exposes direct JavaScript methods', async () => {
		const ultimabase = new (UltimaBase.use(workflowPlugin))({
			pluginPrivileges: { logger: false },
			schemas: [WorkflowPost],
		})
		const surface = ultimabase
			.compile()
			.typegenGraph.schemaSurfaces.find(
				({ schema }) => schema.className === WorkflowPost.className,
			)
		const command = surface?.schemaMutations.get('archive')

		expect(command?.owner.pluginId).toBe(
			workflowPlugin.manifest.identity.pluginId,
		)
		expect(command?.mutation).toMatchObject({
			authority: 'request',
			effect: 'update',
			name: archive.name,
			returning: 'after',
			select: { workflowState: true },
			version: '1.0.0',
		})
		expect(command?.mutation.input).not.toHaveProperty('snapshot')
		expect(JSON.stringify(command?.mutation)).not.toContain('snapshot')

		const schemaHandle = ultimabase.schema(WorkflowPost)
		expect('archive' in schemaHandle).toBe(true)
		expect(typeof Reflect.get(schemaHandle, 'archive')).toBe('function')
		await expect(
			(Reflect.get(schemaHandle, 'archive') as () => Promise<unknown>)(),
		).rejects.toThrow('input must be a plain object')
		const persisted = materializeSchemaModel(WorkflowPost, {
			createdAt: '2026-09-10T00:00:00.000Z',
			id: '0199325a-0c00-7000-8000-000000000001',
			title: 'Published',
			updatedAt: '2026-09-10T00:00:00.000Z',
			workflowState: 'published',
		})
		const boundModel = bindApplicationSchemaModel(schemaHandle, persisted)
		expect('archive' in boundModel).toBe(true)
		await expect(
			(Reflect.get(boundModel, 'archive') as () => Promise<unknown>)(),
		).rejects.toThrow('input must be a string')
		const persistedHandle = schemaHandle.for(persisted)
		expect('archive' in persistedHandle).toBe(true)
		await expect(
			(Reflect.get(persistedHandle, 'archive') as () => Promise<unknown>)(),
		).rejects.toThrow('input must be a string')

		const draft = new WorkflowPost({
			title: 'Draft',
			workflowState: 'draft',
		})
		await expect(
			(
				Reflect.get(
					schemaHandle.for(draft),
					'archive',
				) as () => Promise<unknown>
			)(),
		).rejects.toThrow('requires persisted model state')
	})

	it('compiles selected model mutations before relationship metadata is published', () => {
		const Related = Schema.define({
			className: 'SchemaMutationCompilationOrderRelated',
			fields: () => ({}),
		})
		const Document = Schema.define({
			className: 'SchemaMutationCompilationOrderDocument',
			fields: (field) => ({
				related: field.relation({ target: Related.className }),
			}),
		})
		const mutation = defineSchemaMutation({
			authority: 'request',
			effect: 'update',
			input: defineOperationValue((value) => value),
			name: 'fixture.compilation-order.mutate',
			returning: 'after',
			version: '1.0.0',
		})
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.schema-mutation-compilation-order',
			permissions: {
				'model:extend': 'Adds the model mutation.',
				'operation:declare': 'Declares the mutation.',
			},
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					operations: ({ operations }) => {
						operations.declare(mutation)
						return undefined
					},
					models: ({ models }) => {
						models.extend(
							{ className: Document.className },
							{
								contributionId: 'selected-relation-mutation',
								schemaMutations: {
									mutate: { mutation, surfaces: ['model'] },
								},
							},
						)
						return undefined
					},
				}),
			],
		})
		const ultimabase = new (UltimaBase.use(plugin))({
			pluginPrivileges: { logger: false },
			schemas: [Related, Document],
		})

		expect(
			ultimabase
				.compile()
				.typegenGraph.schemaSurfaces.find(
					({ schema }) => schema.className === Document.className,
				)
				?.modelMutations.has('mutate'),
		).toBe(true)
	})

	it('rejects foreign owners, unavailable dependencies, and duplicate aliases', () => {
		const declaringPlugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.schema-mutation-owner',
			permissions: { 'operation:declare': 'Declares archive.' },
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					operations: ({ operations }) => {
						operations.declare(archive)
						return undefined
					},
				}),
			],
		})
		const foreignSurface = createPlugin({
			core: '^0.0.0',
			id: 'fixture.schema-mutation-foreign',
			permissions: { 'model:extend': 'Exercises ownership checks.' },
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					models: ({ models }) => {
						models.extend(WorkflowPost, {
							contributionId: 'foreign',
							schemaMutations: {
								archive: { mutation: archive, surfaces: ['schema'] },
							},
						})
						return undefined
					},
				}),
			],
		})
		const foreignApplication = new (UltimaBase.use(
			declaringPlugin,
			foreignSurface,
		))({ pluginPrivileges: { logger: false }, schemas: [WorkflowPost] })
		expect(() => foreignApplication.schema(WorkflowPost)).toThrow(
			'must be attached by its declaring owner',
		)

		const missingField = defineSchemaMutation({
			authority: archive.authority,
			effect: archive.effect,
			errors: archive.errors,
			input: archive.input,
			name: 'fixture.workflow.missing-field',
			returning: archive.returning,
			select: { removedField: true },
			version: archive.version,
		})
		const invalidSelection = createPlugin({
			core: '^0.0.0',
			id: 'fixture.schema-mutation-invalid-selection',
			permissions: {
				'model:extend': 'Adds one invalid mutation.',
				'operation:declare': 'Declares one invalid mutation.',
			},
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					operations: ({ operations }) => {
						operations.declare(missingField)
						return undefined
					},
					models: ({ models }) => {
						models.extend(WorkflowPost, {
							contributionId: 'missing-field',
							schemaMutations: {
								archive: { mutation: missingField, surfaces: ['schema'] },
							},
						})
						return undefined
					},
				}),
			],
		})
		expect(() =>
			new (UltimaBase.use(invalidSelection))({
				pluginPrivileges: { logger: false },
				schemas: [WorkflowPost],
			}).schema(WorkflowPost),
		).toThrow('selects unavailable persisted field: removedField')

		const duplicate = createPlugin({
			core: '^0.0.0',
			id: 'fixture.schema-mutation-duplicate',
			permissions: {
				'model:extend': 'Exercises alias conflicts.',
				'operation:declare': 'Declares archive.',
			},
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					operations: ({ operations }) => {
						operations.declare(archive)
						return undefined
					},
					models: ({ models }) => {
						models.extend(WorkflowPost, {
							contributionId: 'first',
							schemaMutations: {
								archive: { mutation: archive, surfaces: ['schema'] },
							},
						})
						models.extend(WorkflowPost, {
							contributionId: 'second',
							schemaMutations: {
								archive: { mutation: archive, surfaces: ['model'] },
							},
						})
						return undefined
					},
				}),
			],
		})
		expect(() =>
			new (UltimaBase.use(duplicate))({
				pluginPrivileges: { logger: false },
				schemas: [WorkflowPost],
			}).schema(WorkflowPost),
		).toThrow('surface contains duplicate command: archive')
	})

	it('keeps two explicit plugin instances deterministic with distinct identities', () => {
		const configured = (
			instanceId: 'editorial' | 'legal',
			command: 'archiveEditorial' | 'archiveLegal',
		) => {
			const mutation = defineSchemaMutation({
				authority: archive.authority,
				effect: archive.effect,
				errors: archive.errors,
				input: archive.input,
				name: `fixture.workflow.${instanceId}`,
				returning: archive.returning,
				select: archive.select,
				version: archive.version,
			})
			return createPlugin({
				core: '^0.0.0',
				instanceId,
				id: 'fixture.schema-mutation-instance',
				permissions: {
					'model:extend': 'Adds an instance mutation.',
					'operation:declare': 'Declares an instance mutation.',
				},
				version: '1.0.0',
				contributions: [
					contributeDeclarations({
						operations: ({ operations }) => {
							operations.declare(mutation)
							return undefined
						},
						models: ({ models }) => {
							models.extend(WorkflowPost, {
								contributionId: 'workflow-mutations',
								schemaMutations: {
									[command]: { mutation, surfaces: ['schema'] },
								},
							})
							return undefined
						},
					}),
				],
			})
		}
		const application = new (UltimaBase.use(
			configured('editorial', 'archiveEditorial'),
			configured('legal', 'archiveLegal'),
		))({
			pluginPrivileges: { logger: false },
			schemas: [WorkflowPost],
		})
		const surface = application
			.compile()
			.typegenGraph.schemaSurfaces.find(
				({ schema }) => schema.className === WorkflowPost.className,
			)

		expect([...(surface?.schemaMutations.keys() ?? [])]).toStrictEqual([
			'archiveEditorial',
			'archiveLegal',
		])
		expect(
			surface?.schemaMutations.get('archiveEditorial')?.owner.instanceId,
		).toBe('editorial')
		expect(surface?.schemaMutations.get('archiveLegal')?.owner.instanceId).toBe(
			'legal',
		)
		expect(
			Object.isFrozen(surface?.schemaMutations.get('archiveLegal')?.mutation),
		).toBe(true)
	})
})
