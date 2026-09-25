import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { vi } from 'vitest'
import { applicationFixture } from '../application-fixture.js'

import { provideTestDatabaseAdapter } from '../runtime/fixtures/database-adapter-capability.js'
import {
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
	type RecordingAdapterCapabilityOptions,
} from '../runtime/fixtures/recording-database-adapter.js'
import {
	addSchemaField,
	defineOperationValue,
	definePlugin,
	defineSchemaMutation,
} from '../../src/foundation.js'
import type { SchemaDefinition } from '../../src/schema/index.js'
import { Schema, stringField } from '../../src/schema/index.js'
import { UltimaBase } from '../../src/runtime/application/ultima-base.js'
import {
	provideRuntimeBehavior,
	provideRuntimeConstraint,
} from '../../src/runtime/capabilities.js'
import { databaseConstraint } from '../../src/runtime/enforcement/definitions.js'
import { protectedPolicy } from '../../src/runtime/enforcement/protected-policy.js'
import { MasterAuthority } from '../../src/runtime/master/master-authority.js'
import {
	persistencePlanRewriter,
	providePersistencePlanRewriter,
} from '../../src/runtime/persistence/capabilities.js'
import {
	provideSchemaMutationHandler,
	schemaMutationHandler,
} from '../../src/runtime/schema-mutations/capabilities.js'

let fixtureIndex = 0
const inputContract = defineOperationValue((value, path) => {
	if (!isPlainRecord(value) || typeof value.reason !== 'string') {
		throw new TypeError(`${path}.reason must be a string`)
	}
	return immutableRecord({ reason: value.reason })
})

export const createUpdateFixture = async (options: {
	readonly handler?: (input: {
		readonly context: { readonly requestId: string }
		readonly input: Readonly<{ readonly reason: string }>
		readonly originalItem: Readonly<Record<string, unknown>>
		readonly target: Readonly<{
			readonly id: string
			readonly schema: SchemaDefinition
		}>
	}) => unknown
	readonly omitHandler?: boolean
	readonly observeOperation?: (kind: string) => void
	readonly observeRewrite?: (logicalKind: string, physicalKind: string) => void
	readonly persistenceCapabilities?: RecordingAdapterCapabilityOptions
	readonly protectedConstraint?: boolean
	readonly results: readonly QueuedAdapterResult[]
	readonly start?: boolean
}) => {
	fixtureIndex += 1
	const Post = Schema.define({
		className: `SchemaMutationRuntimePost${String(fixtureIndex)}`,
		fields: (field) => ({ title: field.string() }),
	})
	const archive = defineSchemaMutation({
		authority: 'request',
		effect: 'update',
		input: inputContract,
		name: `fixture.schema-mutation.archive-${String(fixtureIndex)}`,
		returning: 'after',
		select: { title: true },
		version: '1.0.0',
	})
	const trace: string[] = []
	const adapter = new RecordingDatabaseAdapter(
		options.results,
		trace,
		{},
		options.persistenceCapabilities,
	)
	const handler = schemaMutationHandler({
		mutation: archive,
		resolve: ({ context, input, originalItem, target }) => {
			trace.push('handler')
			return (options.handler?.({ context, input, originalItem, target }) ?? {
				data: { workflowState: 'archived' },
			}) as { readonly data: Readonly<Record<string, unknown>> }
		},
	})
	const workflow = definePlugin({
		capabilities: [
			...(options.omitHandler === true
				? []
				: [
						provideSchemaMutationHandler({
							contributionId: 'archive-handler',
							create: () => ({ value: handler }),
						}),
					]),
			provideRuntimeBehavior({
				contributionId: 'logical-operation-observer',
				create: () => ({
					value: {
						beforeOperation: ({ operation }) => {
							options.observeOperation?.(operation.kind)
						},
					},
				}),
			}),
			providePersistencePlanRewriter({
				contributionId: 'logical-schema-mutation-rewriter',
				create: () => ({
					value: persistencePlanRewriter({
						operations: ['plugin-schema-mutation'],
						rewrite: ({ logicalOperation, plan }) => {
							options.observeRewrite?.(logicalOperation.kind, plan.kind)
							return plan
						},
					}),
				}),
			}),
			...(options.protectedConstraint === true
				? [
						provideRuntimeConstraint({
							contributionId: 'schema-mutation-policy',
							create: () => ({
								value: protectedPolicy({
									evaluate: () => ({
										constraints: databaseConstraint(
											'fixture.schema-mutation-tenant',
											1,
											{ tenant: 'visible' },
										),
									}),
								}),
							}),
						}),
					]
				: []),
		],
		core: '^0.0.0',
		declare: ({ models, operations, schemas }) => {
			operations.declare(archive)
			schemas.patch({
				operations: [
					addSchemaField({
						contributionId: 'workflow-state',
						field: stringField(),
						name: 'workflowState',
					}),
				],
				targets: schemas.select({ className: Post.className }),
			})
			models.extend(
				{ className: Post.className },
				{
					contributionId: 'workflow-mutations',
					schemaMutations: {
						archive: { mutation: archive, surfaces: ['schema', 'model'] },
					},
				},
			)
		},
		pluginId: `fixture.schema-mutation-runtime-${String(fixtureIndex)}`,
		privileges: [
			{ name: 'model:extend', reason: 'Adds the archive command.' },
			{ name: 'operation:declare', reason: 'Declares archive.' },
			{ name: 'persistence:rewrite', reason: 'Persists the owner effect.' },
			{ name: 'runtime:intercept', reason: 'Observes logical identity.' },
			{ name: 'runtime:constrain', reason: 'Narrows protected execution.' },
			{ name: 'schema:declare', reason: 'Adds the owned workflow field.' },
		] as const,
		version: '1.0.0',
	})
	const database = definePlugin({
		capabilities: [provideTestDatabaseAdapter(adapter)],
		core: '^0.0.0',
		pluginId: `fixture.schema-mutation-database-${String(fixtureIndex)}`,
		version: '1.0.0',
	})
	const ultimabase = applicationFixture(
		new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [database, workflow],
			schemas: [Post],
		}),
	)
	if (options.start !== false) await ultimabase.start()
	return { adapter, Post, trace, ultimabase }
}

export const row = (id: string, workflowState: string) => ({
	createdAt: '2026-09-10T00:00:00.000Z',
	id,
	title: 'Release notes',
	updatedAt: '2026-09-10T00:00:00.000Z',
	workflowState,
})

export const createMasterDeleteFixture = async (
	result: QueuedAdapterResult,
) => {
	fixtureIndex += 1
	const Post = Schema.define({
		className: `SchemaMutationMasterPost${String(fixtureIndex)}`,
		fields: (field) => ({ title: field.string() }),
	})
	const purge = defineSchemaMutation({
		authority: 'master',
		effect: 'delete',
		input: defineOperationValue((value, path): undefined => {
			if (value !== undefined) throw new TypeError(`${path} must be undefined`)
			return undefined
		}),
		name: `fixture.schema-mutation.purge-${String(fixtureIndex)}`,
		returning: 'before',
		select: { title: true },
		version: '1.0.0',
	})
	const trace: string[] = []
	const adapter = new RecordingDatabaseAdapter([result], trace)
	const handler = vi.fn(() => undefined)
	const owner = definePlugin({
		capabilities: [
			provideSchemaMutationHandler({
				contributionId: 'purge-handler',
				create: () => ({
					value: schemaMutationHandler({ mutation: purge, resolve: handler }),
				}),
			}),
		],
		core: '^0.0.0',
		declare: ({ models, operations }) => {
			operations.declare(purge)
			models.extend(
				{ className: Post.className },
				{
					contributionId: 'purge-surface',
					schemaMutations: {
						purge: { mutation: purge, surfaces: ['schema'] },
					},
				},
			)
		},
		pluginId: `fixture.schema-mutation-master-${String(fixtureIndex)}`,
		privileges: [
			{ name: 'model:extend', reason: 'Adds the purge command.' },
			{ name: 'operation:declare', reason: 'Declares purge.' },
			{ name: 'persistence:rewrite', reason: 'Persists the delete effect.' },
		] as const,
		version: '1.0.0',
	})
	const database = definePlugin({
		capabilities: [provideTestDatabaseAdapter(adapter)],
		core: '^0.0.0',
		pluginId: `fixture.schema-mutation-master-database-${String(fixtureIndex)}`,
		version: '1.0.0',
	})
	const audit = vi.fn()
	const ultimabase = applicationFixture(
		new UltimaBase({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'schema-mutation-master', value: 'unused-terminal-key' }],
				onUse: audit,
			}),
			pluginPrivileges: { logger: false },
			plugins: [database, owner],
			schemas: [Post],
		}),
	)
	await ultimabase.start()

	return { adapter, audit, handler, Post, trace, ultimabase }
}
