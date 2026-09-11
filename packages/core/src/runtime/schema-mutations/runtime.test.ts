import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it, vi } from 'vitest'

import {
	addSchemaField,
	defineOperationValue,
	definePlugin,
	defineSchemaMutation,
} from '../../foundation.js'
import { Schema, stringField } from '../../schema/index.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { UltimaBase } from '../application/ultima-base.js'
import {
	provideRuntimeBehavior,
	provideRuntimeConstraint,
} from '../capabilities.js'
import { RequestContext, requestSources } from '../context/request-context.js'
import { databaseConstraint } from '../enforcement/definitions.js'
import { protectedPolicy } from '../enforcement/protected-policy.js'
import { MasterAuthority } from '../master/master-authority.js'
import {
	persistencePlanRewriter,
	providePersistencePlanRewriter,
} from '../persistence/capabilities.js'
import {
	RecordingDatabaseAdapter,
	type RecordingAdapterCapabilityOptions,
	type QueuedAdapterResult,
} from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import {
	provideSchemaMutationHandler,
	schemaMutationHandler,
} from './capabilities.js'

let fixtureIndex = 0
const inputContract = defineOperationValue((value, path) => {
	if (!isPlainRecord(value) || typeof value.reason !== 'string') {
		throw new TypeError(`${path}.reason must be a string`)
	}
	return immutableRecord({ reason: value.reason })
})

const createUpdateFixture = async (options: {
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
		capabilities: {
			provides: [
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
		},
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
		capabilities: { provides: [provideTestDatabaseAdapter(adapter)] },
		core: '^0.0.0',
		pluginId: `fixture.schema-mutation-database-${String(fixtureIndex)}`,
		version: '1.0.0',
	})
	const ultimabase = new UltimaBase({
		pluginPrivileges: { logger: false },
		plugins: [database, workflow],
		schemas: [Post],
	})
	if (options.start !== false) await ultimabase.start()
	return { adapter, Post, trace, ultimabase }
}

const row = (id: string, workflowState: string) => ({
	createdAt: '2026-09-10T00:00:00.000Z',
	id,
	title: 'Release notes',
	updatedAt: '2026-09-10T00:00:00.000Z',
	workflowState,
})

const createMasterDeleteFixture = async (result: QueuedAdapterResult) => {
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
		capabilities: {
			provides: [
				provideSchemaMutationHandler({
					contributionId: 'purge-handler',
					create: () => ({
						value: schemaMutationHandler({ mutation: purge, resolve: handler }),
					}),
				}),
			],
		},
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
		capabilities: { provides: [provideTestDatabaseAdapter(adapter)] },
		core: '^0.0.0',
		pluginId: `fixture.schema-mutation-master-database-${String(fixtureIndex)}`,
		version: '1.0.0',
	})
	const audit = vi.fn()
	const ultimabase = new UltimaBase({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'schema-mutation-master', value: 'unused-terminal-key' }],
			onUse: audit,
		}),
		pluginPrivileges: { logger: false },
		plugins: [database, owner],
		schemas: [Post],
	})
	await ultimabase.start()

	return { adapter, audit, handler, Post, trace, ultimabase }
}

describe('plugin schema mutation Runtime', () => {
	it('executes schema and bound-model methods through owner-only update plans', async () => {
		const id = '0199325a-0c00-7000-8000-000000000101'
		const previous = row(id, 'published')
		const current = row(id, 'archived')
		const handler = vi.fn()
		const fixture = await createUpdateFixture({
			handler: (input) => {
				handler(input)
				return { data: { workflowState: 'archived' } }
			},
			results: [
				{
					materializations: [{ current, kind: 'update', previous }],
					status: 'fulfilled',
					target: previous,
					value: {
						id,
						title: current.title,
						workflowState: current.workflowState,
					},
				},
				{
					materializations: [{ current, kind: 'update', previous: current }],
					status: 'fulfilled',
					target: current,
					value: {
						id,
						title: current.title,
						workflowState: current.workflowState,
					},
				},
			],
		})
		const archive = Reflect.get(
			fixture.ultimabase.schema(fixture.Post),
			'archive',
		) as (input: unknown) => Promise<unknown>
		const result = await archive({
			id,
			input: { reason: 'superseded' },
			select: { title: true, workflowState: true },
		})

		expect(result).toBeInstanceOf(fixture.Post)
		expect(result).toMatchObject({
			id,
			title: 'Release notes',
			workflowState: 'archived',
		})
		const boundArchive = Reflect.get(result as object, 'archive') as (
			input: unknown,
		) => Promise<unknown>
		await expect(
			boundArchive({
				input: { reason: 'repeat' },
				select: { title: true, workflowState: true },
			}),
		).resolves.toBeInstanceOf(fixture.Post)
		expect(handler).toHaveBeenCalledWith(
			expect.objectContaining({
				input: { reason: 'superseded' },
				originalItem: { id, title: 'Release notes' },
			}),
		)
		const handlerInput: unknown = handler.mock.calls[0]?.[0]
		expect(isPlainRecord(handlerInput)).toBe(true)
		if (!isPlainRecord(handlerInput))
			throw new TypeError('Expected handler input')
		expect(isPlainRecord(handlerInput.originalItem)).toBe(true)
		expect(Object.isFrozen(handlerInput.originalItem)).toBe(true)
		expect(Object.keys(handlerInput).sort()).toStrictEqual([
			'context',
			'input',
			'originalItem',
			'target',
		])
		expect(fixture.adapter.transactions).toHaveLength(2)
		expect(
			fixture.adapter.transactions[0]?.executions[0]?.operation,
		).toMatchObject({
			kind: 'update-one',
			update: {
				kind: 'update-expression',
				operations: [
					{ field: 'workflowState', kind: 'set', value: 'archived' },
				],
			},
		})
		expect(fixture.trace).toEqual([
			'adapter:begin',
			'prepare:delete-one',
			'handler',
			'execute:delete-one',
			'adapter:commit',
			'adapter:begin',
			'prepare:delete-one',
			'handler',
			'execute:delete-one',
			'adapter:commit',
		])
	})

	it('hides missing targets and rolls back before invoking the handler', async () => {
		const handler = vi.fn()
		const fixture = await createUpdateFixture({
			handler,
			results: [{ status: 'fulfilled', target: null, value: null }],
		})
		const archive = Reflect.get(
			fixture.ultimabase.schema(fixture.Post),
			'archive',
		) as (input: unknown) => Promise<unknown>

		await expect(
			archive({
				id: '0199325a-0c00-7000-8000-000000000102',
				input: { reason: 'missing' },
			}),
		).rejects.toMatchObject({ code: 'NOT_FOUND' })
		expect(handler).not.toHaveBeenCalled()
		expect(fixture.trace.at(-1)).toBe('adapter:rollback')
	})

	it('rejects fields outside the exact mutation owner before persistence', async () => {
		const id = '0199325a-0c00-7000-8000-000000000103'
		const previous = row(id, 'published')
		const fixture = await createUpdateFixture({
			handler: () => ({ data: { title: 'forbidden' } }),
			results: [{ status: 'fulfilled', target: previous, value: previous }],
		})
		const archive = Reflect.get(
			fixture.ultimabase.schema(fixture.Post),
			'archive',
		) as (input: unknown) => Promise<unknown>

		await expect(
			archive({ id, input: { reason: 'invalid owner' } }),
		).rejects.toMatchObject({
			code: 'PLUGIN_OPERATION_INVALID',
			internalDetails: { field: 'title' },
		})
		expect(fixture.adapter.transactions[0]?.executions).toHaveLength(0)
		expect(fixture.trace.at(-1)).toBe('adapter:rollback')
	})

	it('exposes only the custom logical identity to Runtime behavior', async () => {
		const id = '0199325a-0c00-7000-8000-000000000104'
		const previous = row(id, 'published')
		const current = row(id, 'archived')
		const observed: string[] = []
		const rewrites: string[] = []
		const fixture = await createUpdateFixture({
			observeOperation: (kind) => observed.push(kind),
			observeRewrite: (logical, physical) =>
				rewrites.push(`${logical}:${physical}`),
			results: [
				{
					materializations: [{ current, kind: 'update', previous }],
					status: 'fulfilled',
					target: previous,
					value: { id, title: current.title, workflowState: 'archived' },
				},
			],
		})
		const archive = Reflect.get(
			fixture.ultimabase.schema(fixture.Post),
			'archive',
		) as (input: unknown) => Promise<unknown>

		await archive({
			id,
			input: { reason: 'logical identity' },
			select: { title: true, workflowState: true },
		})

		expect(observed).toStrictEqual(['plugin-schema-mutation'])
		expect(observed).not.toContain('update-one')
		expect(observed).not.toContain('delete-one')
		expect(rewrites).toStrictEqual(['plugin-schema-mutation:update-one'])
	})

	it('retains protected constraints from target lock through the final write', async () => {
		const id = '0199325a-0c00-7000-8000-000000000108'
		const previous = row(id, 'published')
		const current = row(id, 'archived')
		const fixture = await createUpdateFixture({
			protectedConstraint: true,
			results: [
				{
					materializations: [{ current, kind: 'update', previous }],
					status: 'fulfilled',
					target: previous,
					value: current,
				},
			],
		})
		const archive = Reflect.get(
			fixture.ultimabase.schema(fixture.Post),
			'archive',
		) as (input: unknown) => Promise<unknown>

		await archive({ id, input: { reason: 'constrained' } })

		expect(fixture.adapter.transactions[0]?.requests[0]?.constraints).toEqual([
			expect.objectContaining({
				kind: 'fixture.schema-mutation-tenant',
				version: 1,
			}),
		])
		expect(fixture.adapter.transactions[0]?.executions[0]?.constraints).toEqual(
			[
				expect.objectContaining({
					kind: 'fixture.schema-mutation-tenant',
					version: 1,
				}),
			],
		)
	})

	it('rolls back cancellation after the owner handler and before persistence', async () => {
		const controller = new AbortController()
		const handler = vi.fn()
		const id = '0199325a-0c00-7000-8000-000000000105'
		const fixture = await createUpdateFixture({
			handler: (input) => {
				handler(input)
				controller.abort()
				return { data: { workflowState: 'archived' } }
			},
			results: [
				{ status: 'fulfilled', target: row(id, 'published'), value: null },
			],
		})
		const archive = Reflect.get(
			fixture.ultimabase.schema(fixture.Post),
			'archive',
		) as (input: unknown, options: unknown) => Promise<unknown>
		const context = RequestContext.anonymous({
			requestId: 'cancelled-schema-mutation',
			signal: controller.signal,
			source: requestSources.internal,
		})

		await expect(
			archive(
				{
					id,
					input: { reason: 'cancelled' },
				},
				{ context, ultimabase: fixture.ultimabase },
			),
		).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
		expect(handler).toHaveBeenCalledOnce()
		expect(fixture.trace).toEqual([
			'adapter:begin',
			'prepare:delete-one',
			'handler',
			'adapter:rollback',
		])
	})

	it('keeps handler-started schema work inside the root transaction', async () => {
		const id = '0199325a-0c00-7000-8000-000000000109'
		const previous = row(id, 'published')
		const current = row(id, 'archived')
		const fixture = await createUpdateFixture({
			handler: async ({ target }) => {
				const schema = target.schema as SchemaDefinition &
					Readonly<{ findMany: () => Promise<unknown> }>
				await schema.findMany()
				return { data: { workflowState: 'archived' } }
			},
			results: [
				{
					materializations: [{ current, kind: 'update', previous }],
					status: 'fulfilled',
					target: previous,
					value: current,
				},
				{ status: 'fulfilled', value: [] },
			],
		})
		const archive = Reflect.get(
			fixture.ultimabase.schema(fixture.Post),
			'archive',
		) as (input: unknown) => Promise<unknown>

		await archive({ id, input: { reason: 'nested query' } })

		expect(fixture.adapter.rootRequests).toStrictEqual([])
		expect(
			fixture.adapter.transactions[0]?.requests.map(
				({ operation }) => operation.kind,
			),
		).toStrictEqual(['delete-one', 'find-many'])
		expect(fixture.trace.at(-1)).toBe('adapter:commit')
	})

	it('rejects missing handlers and unsupported persistence before request effects', async () => {
		const missingHandler = await createUpdateFixture({
			omitHandler: true,
			results: [],
			start: false,
		})
		await expect(missingHandler.ultimabase.start()).rejects.toMatchObject({
			code: 'PLUGIN_OPERATION_INVALID',
			internalDetails: { kind: 'schema-mutation-handler-missing' },
		})
		expect(missingHandler.trace).toStrictEqual([])

		const unsupportedAdapter = await createUpdateFixture({
			persistenceCapabilities: { persistencePlans: false },
			results: [],
			start: false,
		})
		await expect(unsupportedAdapter.ultimabase.start()).rejects.toThrow(
			'schema mutation persistence plan protocol version 2',
		)
		expect(unsupportedAdapter.trace).toStrictEqual([])
	})

	it('rejects Master-only deletes before lookup and compiles an audited delete plan', async () => {
		const id = '0199325a-0c00-7000-8000-000000000106'
		const previous = {
			createdAt: '2026-09-10T00:00:00.000Z',
			id,
			title: 'Release notes',
			updatedAt: '2026-09-10T00:00:00.000Z',
		}
		const fixture = await createMasterDeleteFixture({
			materializations: [{ kind: 'delete', previous }],
			status: 'fulfilled',
			target: previous,
			value: { id, title: previous.title },
		})
		const purge = Reflect.get(
			fixture.ultimabase.schema(fixture.Post),
			'purge',
		) as (input: unknown, options?: unknown) => Promise<unknown>

		await expect(purge({ id })).rejects.toMatchObject({
			code: 'MASTER_ACCESS_DENIED',
		})
		expect(fixture.trace).toStrictEqual([])
		expect(fixture.handler).not.toHaveBeenCalled()

		await expect(
			purge({ id, select: { title: true } }, { useMasterKey: true }),
		).resolves.toMatchObject({ id, title: 'Release notes' })
		expect(fixture.audit).toHaveBeenCalledOnce()
		expect(fixture.handler).toHaveBeenCalledOnce()
		expect(fixture.adapter.transactions[0]?.executions[0]?.operation.kind).toBe(
			'delete-one',
		)
	})

	it('rejects a foreign application owner before transaction effects', async () => {
		const firstHandler = vi.fn()
		const first = await createUpdateFixture({
			handler: firstHandler,
			results: [],
		})
		const second = await createUpdateFixture({ results: [] })
		const archive = Reflect.get(
			first.ultimabase.schema(first.Post),
			'archive',
		) as (input: unknown, options: unknown) => Promise<unknown>

		await expect(
			archive(
				{
					id: '0199325a-0c00-7000-8000-000000000107',
					input: { reason: 'foreign owner' },
				},
				{ ultimabase: second.ultimabase },
			),
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
		expect(firstHandler).not.toHaveBeenCalled()
		expect(first.trace).toStrictEqual([])
		expect(second.trace).toStrictEqual([])
	})

	it('keeps a valid handler dormant when no schema selects its mutation', async () => {
		const dormantMutation = defineSchemaMutation({
			authority: 'request',
			effect: 'update',
			input: defineOperationValue((value) => value),
			name: 'fixture.schema-mutation.dormant',
			returning: 'after',
			version: '1.0.0',
		})
		const dormantOwner = definePlugin({
			capabilities: {
				provides: [
					provideSchemaMutationHandler({
						contributionId: 'dormant-handler',
						create: () => ({
							value: schemaMutationHandler({
								mutation: dormantMutation,
								resolve: () => ({ data: {} }),
							}),
						}),
					}),
				],
			},
			core: '^0.0.0',
			declare: ({ operations }) => {
				operations.declare(dormantMutation)
			},
			pluginId: 'fixture.schema-mutation-dormant',
			privileges: [
				{ name: 'operation:declare', reason: 'Declares an optional mutation.' },
				{ name: 'persistence:rewrite', reason: 'Owns its optional effect.' },
			] as const,
			version: '1.0.0',
		})
		const database = definePlugin({
			capabilities: {
				provides: [
					provideTestDatabaseAdapter(new RecordingDatabaseAdapter([], [])),
				],
			},
			core: '^0.0.0',
			pluginId: 'fixture.schema-mutation-dormant-database',
			version: '1.0.0',
		})
		const ultimabase = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [database, dormantOwner],
			schemas: [],
		})

		await expect(ultimabase.start()).resolves.toBeUndefined()
		await ultimabase.dispose()
	})
})
