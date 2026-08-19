import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'
import { provideTestRuntimeInterceptor } from '../../tests/runtime/fixtures/runtime-capabilities.js'

import { UltimaBase } from '../runtime/application/ultima-base.js'
import type { ApplicationOperationHandle } from '../application/application-handles.js'
import { beforeOperation } from '../runtime/hooks/definitions.js'
import { QueryBuilder } from '../query/query/query.js'
import { materializeSchemaModel } from '../schema/schema/model-materialization.js'
import { Schema } from '../schema/schema/definition.js'
import { definePlugin } from './definition.js'
import { defineOperation, defineOperationValue } from './plugin-operations.js'
import { defineQueryExtension } from './application-surface-declarations.js'

const snapshotMessage = defineOperationValue((value, path) => {
	if (!isPlainRecord(value) || typeof value.message !== 'string') {
		throw new TypeError(`${path}.message must be a string`)
	}
	return immutableRecord({ message: value.message })
})
const snapshotResult = defineOperationValue((value, path) => {
	if (!isPlainRecord(value) || typeof value.accepted !== 'boolean') {
		throw new TypeError(`${path}.accepted must be a boolean`)
	}
	return immutableRecord({ accepted: value.accepted })
})
const applicationOperation = defineOperation({
	input: snapshotMessage,
	name: 'fixture.workflow.inspect',
	result: snapshotResult,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})
const schemaOperation = defineOperation({
	input: snapshotMessage,
	name: 'fixture.workflow.publish-schema',
	result: snapshotResult,
	target: 'schema',
	transaction: 'required',
	version: '1.1.0',
})
const modelOperation = defineOperation({
	input: snapshotMessage,
	name: 'fixture.workflow.publish-model',
	result: snapshotResult,
	target: 'model',
	transaction: 'required',
	version: '2.0.0',
})
const titleQuery = defineQueryExtension({
	apply: (schema, title) =>
		new QueryBuilder(schema).where({ title: { eq: title } }),
	input: defineOperationValue((value, path) => {
		if (typeof value !== 'string')
			throw new TypeError(`${path} must be a string`)
		return value
	}),
	name: 'fixture.workflow.by-title',
	version: '1.0.0',
})

const StablePost = Schema.define({
	className: 'ApplicationSurfaceStablePost',
	fields: (field) => ({ title: field.string() }),
})

const createSurfacePlugin = (dynamicName: string) => {
	const DynamicSchema = Schema.define({
		className: dynamicName,
		fields: (field) => ({ title: field.string() }),
	})
	return {
		DynamicSchema,
		plugin: definePlugin({
			core: '^0.0.0',
			pluginId: `fixture.surface.${dynamicName.toLowerCase()}`,
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Declares one configuration-dependent schema.',
				},
				{
					name: 'model:extend',
					reason: 'Adds schema and immutable model command aliases.',
				},
				{
					name: 'query:extend',
					reason: 'Adds one ordinary QueryBuilder extension.',
				},
				{
					name: 'operation:declare',
					reason: 'Declares inert operation contracts.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ models, operations, queries, schemas }) => {
				schemas.add({
					contributionId: 'dynamic-schema',
					schema: DynamicSchema,
					staticOptions: { source: dynamicName },
				})
				operations.declare(applicationOperation)
				operations.declare(schemaOperation)
				operations.declare(modelOperation)
				for (const className of [StablePost.className, dynamicName]) {
					const target =
						className === dynamicName ? DynamicSchema : { className }
					models.extend(target, {
						contributionId: `workflow:${className}`,
						modelCommands: { publish: modelOperation },
						schemaCommands: { publish: schemaOperation },
					})
					queries.extend(target, {
						contributionId: `queries:${className}`,
						extensions: { byTitle: titleQuery },
					})
				}
			},
		}),
	}
}

describe('application-owned plugin surfaces', () => {
	it('binds stable and dynamic schemas, operations, queries, drafts, and persisted models', async () => {
		const { DynamicSchema, plugin } = createSurfacePlugin(
			'ApplicationSurfaceDynamicPost',
		)
		const ultimabase = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [plugin],
			schemas: [StablePost],
		})

		const stable = ultimabase.schema(StablePost)
		const dynamicName = ['ApplicationSurface', 'DynamicPost'].join('')
		const dynamic = ultimabase.schema(dynamicName)
		expect(ultimabase.schema(StablePost)).toBe(stable)
		expect(ultimabase.schema(DynamicSchema)).toBe(dynamic)
		expect(stable.schema).toBe(StablePost)
		expect(dynamic.schema).toBe(DynamicSchema)
		expect(dynamic.commands.publish?.definition).toBe(schemaOperation)
		expect(Object.isFrozen(stable)).toBe(true)

		const tokenHandle = ultimabase.operation(applicationOperation)
		expect(ultimabase.operation(applicationOperation.name)).toBe(tokenHandle)
		expect(tokenHandle.owner.pluginId).toBe(plugin.manifest.identity.pluginId)
		expect(tokenHandle.prepare({ message: 'inspect' })).toStrictEqual({
			kind: 'plugin-operation',
			name: applicationOperation.name,
			payload: { message: 'inspect' },
			target: { kind: 'application' },
			transaction: 'forbidden',
			version: '1.0.0',
		})

		const schemaEnvelope = stable.command('publish').prepare({ message: 'now' })
		expect(schemaEnvelope.target).toStrictEqual({
			kind: 'schema',
			schema: StablePost.className,
		})
		expect(stable.commands.publish?.definition).toBe(schemaOperation)
		expect(
			(Reflect.get(stable, 'publish') as ApplicationOperationHandle).definition,
		).toBe(schemaOperation)

		const query = stable.query('byTitle', 'Hello')
		expect(query).toBeInstanceOf(QueryBuilder)
		expect(query.schema).toBe(StablePost)
		expect(stable.queries.byTitle?.('Other').schema).toBe(StablePost)
		expect(
			(
				Reflect.get(stable, 'byTitle') as (
					input: string,
				) => QueryBuilder<typeof StablePost>
			)('Direct').schema,
		).toBe(StablePost)

		const draft = new StablePost({ title: 'Draft' })
		const persisted = materializeSchemaModel(StablePost, {
			createdAt: '2026-08-12T00:00:00.000Z',
			id: '0198a43e-2431-7000-8000-000000000099',
			title: 'Persisted',
			updatedAt: '2026-08-12T00:00:00.000Z',
		})
		const draftHandle = stable.for(draft)
		const persistedHandle = stable.for(persisted)
		expect(draftHandle.model).toBe(draft)
		expect(draftHandle.state).toBe('draft')
		expect(persistedHandle.model).toBe(persisted)
		expect(persistedHandle.state).toBe('persisted')
		expect(
			draftHandle.command('publish').prepare({ message: 'draft' }).target,
		).toStrictEqual({
			kind: 'model',
			schema: StablePost.className,
			state: 'draft',
		})
		expect(
			persistedHandle.commands.publish?.prepare({ message: 'saved' }).target,
		).toStrictEqual({
			kind: 'model',
			schema: StablePost.className,
			state: 'persisted',
		})
		expect(
			(
				Reflect.get(draftHandle, 'publish') as ApplicationOperationHandle<
					typeof modelOperation
				>
			).prepare({ message: 'direct' }).target,
		).toMatchObject({ kind: 'model', state: 'draft' })
		expect(() => dynamic.for(draft)).toThrow(
			`Model handle requires an exact ${DynamicSchema.className} model`,
		)
		expect(() => tokenHandle.prepare({ message: 1 } as never)).toThrow(
			'.message must be a string',
		)

		await ultimabase.dispose()
		expect(() => stable.query('byTitle', 'disposed')).toThrow(
			'Application handle cannot be used after disposal',
		)
		expect(() => tokenHandle.prepare({ message: 'disposed' })).toThrow(
			'Application handle cannot be used after disposal',
		)
	})

	it('keeps declarations isolated and rejects duplicate or incompatible surfaces', () => {
		const first = createSurfacePlugin('ApplicationSurfaceIsolationOne')
		const second = createSurfacePlugin('ApplicationSurfaceIsolationTwo')
		const firstApplication = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [first.plugin],
			schemas: [],
		})
		const secondApplication = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [second.plugin],
			schemas: [],
		})
		expect(firstApplication.schema(first.DynamicSchema).schema).toBe(
			first.DynamicSchema,
		)
		expect(() => firstApplication.schema(second.DynamicSchema)).toThrow(
			'Unknown application schema',
		)
		expect(secondApplication.schema(second.DynamicSchema).schema).toBe(
			second.DynamicSchema,
		)

		const duplicate = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.duplicate-operation',
			privileges: [
				{
					name: 'operation:declare',
					reason: 'Exercises operation declaration conflicts.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ operations }) => {
				operations.declare(applicationOperation)
				operations.declare(applicationOperation)
			},
		})
		const duplicateApplication = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [duplicate],
			schemas: [],
		})
		expect(() => duplicateApplication.operation(applicationOperation)).toThrow(
			'Duplicate plugin operation name',
		)
	})

	it('isolates shared schema surfaces and rejects local command conflicts before setup', () => {
		const Shared = Schema.define({
			className: 'ApplicationSurfaceSharedIdentity',
			fields: (field) => ({ title: field.string() }),
		})
		const firstCommand = defineOperation({
			input: snapshotMessage,
			name: 'fixture.surface.first-command',
			result: snapshotResult,
			target: 'schema',
			transaction: 'optional',
			version: '1.0.0',
		})
		const secondCommand = defineOperation({
			input: snapshotMessage,
			name: 'fixture.surface.second-command',
			result: snapshotResult,
			target: 'schema',
			transaction: 'optional',
			version: '1.0.0',
		})
		const commandPlugin = (
			pluginId: string,
			operation: typeof firstCommand | typeof secondCommand,
		) =>
			definePlugin({
				core: '^0.0.0',
				pluginId,
				privileges: [
					{ name: 'model:extend', reason: 'Adds one shared schema command.' },
					{ name: 'operation:declare', reason: 'Declares that command.' },
				] as const,
				version: '1.0.0',
				declare: ({ models, operations }) => {
					operations.declare(operation)
					models.extend(
						{ className: Shared.className },
						{
							contributionId: 'shared-command',
							schemaCommands: { publish: operation },
						},
					)
				},
			})
		const firstPlugin = commandPlugin('fixture.surface.first', firstCommand)
		const compatible = (): UltimaBase<
			readonly [typeof Shared],
			readonly [typeof firstPlugin]
		> =>
			new UltimaBase({
				pluginPrivileges: { logger: false },
				plugins: [firstPlugin],
				schemas: [Shared],
			})
		const first = compatible()
		const repeated = compatible()
		expect(first.schema(Shared).commands.publish?.definition).toBe(firstCommand)
		expect(repeated.schema(Shared).commands.publish?.definition).toBe(
			firstCommand,
		)

		let setupCalls = 0
		const incompatiblePlugin = commandPlugin(
			'fixture.surface.second',
			secondCommand,
		)
		const setupProbe = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.surface.setup-probe',
			version: '1.0.0',
			setup: () => {
				setupCalls += 1
			},
		})
		const isolated = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [incompatiblePlugin, setupProbe],
			schemas: [Shared],
		})
		expect(isolated.schema(Shared).commands.publish?.definition).toBe(
			secondCommand,
		)
		expect(first.schema(Shared).commands.publish?.definition).toBe(firstCommand)

		const conflicting = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [firstPlugin, incompatiblePlugin, setupProbe],
			schemas: [Shared],
		})
		expect(() => conflicting.schema(Shared)).toThrow(
			'contains duplicate command: publish',
		)
		expect(setupCalls).toBe(0)
	})

	it('does not let model or query privileges intercept Runtime implicitly', () => {
		const LocalSchema = Schema.define({
			className: 'ApplicationSurfaceNoRuntimePrivilege',
			fields: (field) => ({ title: field.string() }),
		})
		const plugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.surface-no-runtime-privilege',
			privileges: [
				{ name: 'model:extend', reason: 'Declares one model surface.' },
				{ name: 'operation:declare', reason: 'Declares its operation token.' },
				{ name: 'query:extend', reason: 'Declares one query surface.' },
			] as const,
			version: '1.0.0',
			declare: ({ models, operations, queries }) => {
				operations.declare(schemaOperation)
				models.extend(
					{ className: LocalSchema.className },
					{
						contributionId: 'commands',
						schemaCommands: { publish: schemaOperation },
					},
				)
				queries.extend(
					{ className: LocalSchema.className },
					{ contributionId: 'queries', extensions: { byTitle: titleQuery } },
				)
			},
			capabilities: {
				provides: [
					provideTestRuntimeInterceptor(
						'forged-interceptor',
						beforeOperation({
							handler: () => undefined,
							operations: ['find-many'],
							schema: LocalSchema,
						}),
					),
				],
			},
		})

		expect(
			() =>
				new UltimaBase({
					pluginPrivileges: { logger: false },
					plugins: [plugin],
					schemas: [LocalSchema],
				}),
		).toThrow(expect.objectContaining({ code: 'PLUGIN_CAPABILITY_CONFLICT' }))
	})
})
