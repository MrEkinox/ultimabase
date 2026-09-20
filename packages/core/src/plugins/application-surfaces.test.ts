import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'
import { provideTestRuntimeInterceptor } from '../../tests/runtime/fixtures/runtime-capabilities.js'

import { UltimaBase } from '../runtime/application/ultima-base.js'
import { beforeOperation } from '../runtime/contributions/definitions.js'
import { Schema } from '../schema/schema/definition.js'
import { materializeSchemaModel } from '../schema/schema/model-materialization.js'
import { definePlugin } from './definition.js'
import { defineOperation, defineOperationValue } from './plugin-operations.js'

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
					name: 'operation:declare',
					reason: 'Declares inert operation contracts.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ operations, schemas }) => {
				schemas.add({
					contributionId: 'dynamic-schema',
					schema: DynamicSchema,
					staticOptions: { source: dynamicName },
				})
				operations.declare(applicationOperation)
			},
		}),
	}
}

describe('application-owned plugin surfaces', () => {
	it('binds stable and dynamic schemas, operations, drafts, and persisted models', async () => {
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
		expect(() => dynamic.for(draft)).toThrow(
			`Model handle requires an exact ${DynamicSchema.className} model`,
		)
		expect(() => tokenHandle.prepare({ message: 1 } as never)).toThrow(
			'.message must be a string',
		)

		await ultimabase.dispose()
		expect(() => stable.findMany()).toThrow(
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

	it('does not let model privileges intercept Runtime implicitly', () => {
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
			] as const,
			version: '1.0.0',

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
