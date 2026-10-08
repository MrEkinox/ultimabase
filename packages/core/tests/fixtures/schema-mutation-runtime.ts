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
	contributeSchemaMutation,
	defineOperationValue,
	contributeDeclarations,
	plugin as createPlugin,
	defineSchemaMutation,
} from '../../src/foundation.js'
import type { SchemaDefinition } from '../../src/schema/index.js'
import { stringField } from '../../src/schema/index.js'
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
import type { PluginSchemaMutationHandler } from '../../src/runtime/schema-mutations/contracts.js'

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
	readonly observeResult?: (kind: string) => void
	readonly observeRewrite?: (logicalKind: string, physicalKind: string) => void
	readonly persistenceCapabilities?: RecordingAdapterCapabilityOptions
	readonly protectedConstraint?: boolean
	readonly results: readonly QueuedAdapterResult[]
	readonly start?: boolean
}) => {
	fixtureIndex += 1
	const Post = UltimaBase.Schema.define({
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
	const handler: PluginSchemaMutationHandler<typeof archive> = ({
		context,
		input,
		originalItem,
		target,
	}) => {
		trace.push('handler')
		return (options.handler?.({ context, input, originalItem, target }) ?? {
			data: { workflowState: 'archived' },
		}) as { readonly data: Readonly<Record<string, unknown>> }
	}
	const workflow = createPlugin({
		id: `fixture.schema-mutation-runtime-${String(fixtureIndex)}`,
		core: '^0.0.0',
		version: '1.0.0',
		permissions: {
			'model:extend': 'Adds the archive command.',
			'operation:declare': 'Declares archive.',
			'persistence:rewrite': 'Persists the owner effect.',
			'runtime:intercept': 'Observes logical identity.',
			...(options.protectedConstraint === true
				? { 'runtime:constrain': 'Narrows protected execution.' }
				: {}),
			'schema:declare': 'Adds the owned workflow field.',
		},
		contributions: [
			...(options.omitHandler === true
				? []
				: [
						contributeSchemaMutation({
							mutation: archive,
							resolve: handler,
						}),
					]),
			provideRuntimeBehavior({
				contributionId: 'logical-operation-observer',
				create: () => ({
					value: {
						beforeOperation: ({ operation }) => {
							if (operation.kind === 'plugin-schema-mutation') {
								options.observeOperation?.(operation.kind)
							}
						},
					},
				}),
			}),
			...(options.observeResult === undefined
				? []
				: [
						provideRuntimeBehavior({
							contributionId: 'logical-result-observer',
							create: () => ({
								value: {
									transformResult: ({ operation, result }) => {
										if (operation.kind === 'plugin-schema-mutation') {
											options.observeResult?.(operation.kind)
										}
										return result
									},
								},
							}),
						}),
					]),
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
									operations: ['plugin-schema-mutation'],
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
			contributeDeclarations({
				...(options.omitHandler === true
					? {
							operations: ({ operations }) => {
								operations.declare(archive)
							},
						}
					: {}),
				schema: ({ schemas }) => {
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
				},
				models: ({ models }) => {
					models.extend(
						{ className: Post.className },
						{
							contributionId: 'workflow-mutations',
							schemaMutations: {
								archive: {
									mutation: archive,
									surfaces: ['schema', 'model'],
								},
							},
						},
					)
				},
			}),
		],
	})
	const database = createPlugin({
		core: '^0.0.0',
		id: `fixture.schema-mutation-database-${String(fixtureIndex)}`,
		version: '1.0.0',
		contributions: [provideTestDatabaseAdapter(adapter)],
	})
	const ultimabase = applicationFixture(
		new (UltimaBase.use(database, workflow))({
			pluginPrivileges: { logger: false },
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
	const Post = UltimaBase.Schema.define({
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
	const owner = createPlugin({
		core: '^0.0.0',
		id: `fixture.schema-mutation-master-${String(fixtureIndex)}`,
		permissions: {
			'model:extend': 'Adds the purge command.',
			'operation:declare': 'Declares purge.',
			'persistence:rewrite': 'Persists the delete effect.',
		},
		version: '1.0.0',
		contributions: [
			contributeSchemaMutation({ mutation: purge, resolve: handler }),
			contributeDeclarations({
				models: ({ models }) => {
					models.extend(
						{ className: Post.className },
						{
							contributionId: 'purge-surface',
							schemaMutations: {
								purge: { mutation: purge, surfaces: ['schema'] },
							},
						},
					)
					return undefined
				},
			}),
		],
	})
	const database = createPlugin({
		core: '^0.0.0',
		id: `fixture.schema-mutation-master-database-${String(fixtureIndex)}`,
		version: '1.0.0',
		contributions: [provideTestDatabaseAdapter(adapter)],
	})
	const audit = vi.fn()
	const ultimabase = applicationFixture(
		new (UltimaBase.use(database, owner))({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'schema-mutation-master', value: 'unused-terminal-key' }],
				onUse: audit,
			}),
			pluginPrivileges: { logger: false },
			schemas: [Post],
		}),
	)
	await ultimabase.start()

	return { adapter, audit, handler, Post, trace, ultimabase }
}
