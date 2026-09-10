import { describe, expect, it } from 'vitest'

import { UltimaBase } from '../runtime/application/ultima-base.js'
import { bindApplicationSchemaModel } from '../application/application-model-views.js'
import { materializeSchemaModel } from '../schema/schema/model-materialization.js'
import { Schema } from '../schema/schema/definition.js'
import { definePlugin } from './definition.js'
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

const workflowPlugin = definePlugin({
	core: '^0.0.0',
	pluginId: 'fixture.schema-mutation-workflow',
	privileges: [
		{ name: 'model:extend', reason: 'Adds the archive mutation.' },
		{ name: 'operation:declare', reason: 'Declares the archive mutation.' },
	] as const,
	version: '1.0.0',
	declare: ({ models, operations }) => {
		operations.declare(archive)
		models.extend(WorkflowPost, {
			contributionId: 'workflow-mutations',
			schemaMutations: {
				archive: { mutation: archive, surfaces: ['schema', 'model'] },
			},
		})
	},
})

describe('application-owned schema mutations', () => {
	it('compiles callback-free descriptors and exposes direct JavaScript methods', async () => {
		const ultimabase = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [workflowPlugin],
			schemas: [WorkflowPost],
		})
		const surface = ultimabase.application.getSchemaSurface(
			WorkflowPost.className,
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

	it('rejects foreign owners, unavailable dependencies, and duplicate aliases', () => {
		const declaringPlugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.schema-mutation-owner',
			privileges: [
				{ name: 'operation:declare', reason: 'Declares archive.' },
			] as const,
			version: '1.0.0',
			declare: ({ operations }) => {
				operations.declare(archive)
				return undefined
			},
		})
		const foreignSurface = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.schema-mutation-foreign',
			privileges: [
				{ name: 'model:extend', reason: 'Exercises ownership checks.' },
			] as const,
			version: '1.0.0',
			declare: ({ models }) => {
				models.extend(WorkflowPost, {
					contributionId: 'foreign',
					schemaMutations: {
						archive: { mutation: archive, surfaces: ['schema'] },
					},
				})
				return undefined
			},
		})
		const foreignApplication = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [declaringPlugin, foreignSurface],
			schemas: [WorkflowPost],
		})
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
		const invalidSelection = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.schema-mutation-invalid-selection',
			privileges: [
				{ name: 'model:extend', reason: 'Adds one invalid mutation.' },
				{ name: 'operation:declare', reason: 'Declares one invalid mutation.' },
			] as const,
			version: '1.0.0',
			declare: ({ models, operations }) => {
				operations.declare(missingField)
				models.extend(WorkflowPost, {
					contributionId: 'missing-field',
					schemaMutations: {
						archive: { mutation: missingField, surfaces: ['schema'] },
					},
				})
			},
		})
		expect(() =>
			new UltimaBase({
				pluginPrivileges: { logger: false },
				plugins: [invalidSelection],
				schemas: [WorkflowPost],
			}).schema(WorkflowPost),
		).toThrow('selects unavailable persisted field: removedField')

		const duplicate = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.schema-mutation-duplicate',
			privileges: [
				{ name: 'model:extend', reason: 'Exercises alias conflicts.' },
				{ name: 'operation:declare', reason: 'Declares archive.' },
			] as const,
			version: '1.0.0',
			declare: ({ models, operations }) => {
				operations.declare(archive)
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
			},
		})
		expect(() =>
			new UltimaBase({
				pluginPrivileges: { logger: false },
				plugins: [duplicate],
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
			return definePlugin({
				core: '^0.0.0',
				instanceId,
				pluginId: 'fixture.schema-mutation-instance',
				privileges: [
					{ name: 'model:extend', reason: 'Adds an instance mutation.' },
					{
						name: 'operation:declare',
						reason: 'Declares an instance mutation.',
					},
				] as const,
				version: '1.0.0',
				declare: ({ models, operations }) => {
					operations.declare(mutation)
					models.extend(WorkflowPost, {
						contributionId: 'workflow-mutations',
						schemaMutations: {
							[command]: { mutation, surfaces: ['schema'] },
						},
					})
				},
			})
		}
		const application = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [
				configured('editorial', 'archiveEditorial'),
				configured('legal', 'archiveLegal'),
			],
			schemas: [WorkflowPost],
		})
		const surface = application.application.getSchemaSurface(
			WorkflowPost.className,
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
