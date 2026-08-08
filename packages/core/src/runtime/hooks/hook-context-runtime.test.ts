import { RequestCapability, RequestContextValue } from '../../access/index.js'
import { definePlugin } from '../../foundation.js'
import {
	HookContext,
	Schema,
	stringField,
	type JsonObject,
} from '../../schema/index.js'
import { describe, expect, it } from 'vitest'
import { QueryBuilder } from '../../query/query/query.js'

import { UltimaBase } from '../application/ultima-base.js'
import { RequestContext, requestSources } from '../context/request-context.js'
import { runWithRequestEngine } from '../context/active-framework-context.js'
import { MasterAuthority } from '../master/master-authority.js'
import {
	databaseAdapterServiceToken,
	type DatabaseAdapter,
} from '../database/contracts.js'
import {
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
} from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { defineEvent, onEvent, type HookEventDefinition } from './events.js'

const createDatabasePlugin = (adapter: DatabaseAdapter) =>
	definePlugin({
		name: 'fixture.hook-context-database',
		slot: 'database-adapter',
		setup: ({ services }) => {
			services.provide(databaseAdapterServiceToken, adapter)
		},
	})

const createEventPlugin = (
	name: string,
	events: Readonly<Record<string, Pick<HookEventDefinition, 'kind' | 'name'>>>,
) =>
	definePlugin({
		name,
		setup: ({ registries }) => {
			for (const [eventName, event] of Object.entries(events)) {
				registries.events.register(eventName, event)
			}
		},
	})

const createStoredRecord = (id: string, title: string) => ({
	createdAt: '2026-08-02T20:00:00.000Z',
	id,
	title,
	updatedAt: '2026-08-02T20:00:00.000Z',
})

const createMutationResult = (
	id: string,
	title: string,
): QueuedAdapterResult => {
	const current = createStoredRecord(id, title)

	return {
		materializations: [{ current, kind: 'create' }],
		status: 'fulfilled',
		value: current,
	}
}

describe('HookContext Runtime capabilities', () => {
	it('rejects direct JavaScript construction outside Runtime', () => {
		const constructHookContext = (): void => {
			Reflect.construct(HookContext, [])
		}
		const forgedContext: unknown = Object.create(HookContext.prototype)
		const useForgedContext = (): void => {
			if (!(forgedContext instanceof HookContext)) {
				throw new TypeError('Forged HookContext prototype was not retained')
			}

			forgedContext.hasCapability(
				new RequestCapability('fixture.forged-context'),
			)
		}

		expect(constructHookContext).toThrow(
			new TypeError('HookContext must be created by Runtime'),
		)
		expect(useForgedContext).toThrow(
			new TypeError('Hook context capabilities are unavailable'),
		)
	})

	it('reads plugin-owned request values without exposing context derivation', async () => {
		let escapedContext: HookContext | undefined
		const principal = new RequestContextValue<string>(
			'fixture.principal',
			(value: unknown): string => {
				if (typeof value !== 'string') {
					throw new TypeError('Fixture principal must be a string')
				}

				return value
			},
		)
		const PostSchema = Schema.define({
			className: 'HookContextPrincipalPost',
			fields: { title: stringField({ validation: { required: true } }) },
			hooks: {
				beforeOperation: {
					create: ({ context, item }) => {
						escapedContext = context
						expect(context.getValue(principal)).toBe('user-1')

						void item
					},
				},
			},
		})
		const adapter = new RecordingDatabaseAdapter(
			[
				createMutationResult(
					'0198a43e-2431-7000-8000-000000000209',
					'plugin identity',
				),
			],
			[],
		)
		const ultimabase = new UltimaBase({
			plugins: [createDatabasePlugin(adapter)],
			schemas: [PostSchema],
		})

		await ultimabase.start()
		const request = ultimabase.engine.withContext(
			RequestContext.anonymous({
				requestId: 'hook-context-principal',
				source: requestSources.internal,
			}).withValue(principal, 'user-1'),
		)

		await runWithRequestEngine(request, () =>
			PostSchema.createOne({ data: { title: 'plugin identity' } }),
		)
		expect(() => escapedContext?.getValue(principal)).toThrow(
			expect.objectContaining({ code: 'HOOK_CONTEXT_CLOSED' }),
		)

		await ultimabase.dispose()
	})

	it('keeps nested master terminals inside the hook lease and transaction', async () => {
		const trace: string[] = []
		const transactionIds: (string | undefined)[] = []
		const nestedAccessModes: string[] = []
		const auditReasons: string[] = []
		const AuditSchema = Schema.define({
			className: 'HookContextAudit',
			fields: { title: stringField({ validation: { required: true } }) },
			hooks: {
				beforeOperation: {
					create: ({ context, item }) => {
						nestedAccessModes.push(context.access.mode)
						transactionIds.push(context.transactionId)

						void item
					},
				},
			},
		})
		const PostSchema = Schema.define({
			className: 'HookContextPost',
			fields: { title: stringField({ validation: { required: true } }) },
			hooks: {
				beforeOperation: {
					create: ({ context, item }) => {
						expect(context).toBeInstanceOf(HookContext)
						expect(context.access).toStrictEqual({ mode: 'anonymous' })
						expect(context.source).toBe('internal')
						expect(Object.isFrozen(context)).toBe(true)
						transactionIds.push(context.transactionId)

						void new AuditSchema({ title: 'nested audit' }).create(
							{},
							{ useMasterKey: true },
						)
						void item
					},
				},
			},
		})
		const adapter = new RecordingDatabaseAdapter(
			[
				createMutationResult(
					'0198a43e-2431-7000-8000-000000000201',
					'nested audit',
				),
				createMutationResult('0198a43e-2431-7000-8000-000000000202', 'parent'),
			],
			trace,
		)
		const ultimabase = new UltimaBase({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'hook-server', value: 'unused-by-terminal' }],
				onUse: ({ reason }) => {
					auditReasons.push(reason)
				},
			}),
			plugins: [createDatabasePlugin(adapter)],
			schemas: [PostSchema, AuditSchema],
		})

		await ultimabase.start()
		await expect(
			PostSchema.createOne({ data: { title: 'parent' } }, { ultimabase }),
		).resolves.toMatchObject({ title: 'parent' })

		expect(adapter.transactions).toHaveLength(1)
		expect(adapter.transactions[0]?.requests).toHaveLength(2)
		expect(transactionIds[0]).toMatch(/^[0-9a-f-]{36}$/u)
		expect(transactionIds[1]).toBe(transactionIds[0])
		expect(nestedAccessModes).toStrictEqual(['master'])
		expect(auditReasons).toStrictEqual([
			'Schema command create-one on HookContextAudit',
		])
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:create-one',
			'execute:create-one',
			'prepare:create-one',
			'execute:create-one',
			'adapter:commit',
		])

		await ultimabase.dispose()
	})

	it('keeps caught nested failures rollback-only', async () => {
		const nestedFailure = new Error('nested hook query failed')
		const trace: string[] = []
		const AuditSchema = Schema.define({
			className: 'HookContextFailedAudit',
			fields: { title: stringField({ validation: { required: true } }) },
		})
		const PostSchema = Schema.define({
			className: 'HookContextFailedPost',
			fields: { title: stringField({ validation: { required: true } }) },
			hooks: {
				beforeOperation: {
					create: async ({ item }) => {
						try {
							await AuditSchema.createOne({ data: { title: 'fails' } })
						} catch {
							// Catching nested work cannot make a failed transaction committable.
						}

						void item
					},
				},
			},
		})
		const adapter = new RecordingDatabaseAdapter(
			[{ error: nestedFailure, status: 'rejected' }],
			trace,
		)
		const ultimabase = new UltimaBase({
			plugins: [createDatabasePlugin(adapter)],
			schemas: [PostSchema, AuditSchema],
		})

		await ultimabase.start()
		await expect(
			PostSchema.createOne({ data: { title: 'parent' } }, { ultimabase }),
		).rejects.toBe(nestedFailure)
		expect(trace).toStrictEqual([
			'adapter:begin',
			'prepare:create-one',
			'execute:create-one',
			'adapter:rollback',
		])

		await ultimabase.dispose()
	})

	it('revokes escaped contexts and leaves detached queries context-free', async () => {
		let escapedContext: HookContext | undefined
		let runEscapedQuery: (() => unknown) | undefined
		const capability = new RequestCapability('fixture.escaped-context')
		const PostSchema = Schema.define({
			className: 'HookContextEscapedPost',
			fields: { title: stringField({ validation: { required: true } }) },
			hooks: {
				beforeOperation: {
					create: ({ context, item }) => {
						escapedContext = context
						const query = new QueryBuilder(PostSchema)
						runEscapedQuery = () => PostSchema.findMany(query.build())

						void item
					},
				},
			},
		})
		const adapter = new RecordingDatabaseAdapter(
			[createMutationResult('0198a43e-2431-7000-8000-000000000203', 'stored')],
			[],
		)
		const ultimabase = new UltimaBase({
			plugins: [createDatabasePlugin(adapter)],
			schemas: [PostSchema],
		})

		await ultimabase.start()
		await PostSchema.createOne({ data: { title: 'stored' } }, { ultimabase })

		expect(() => escapedContext?.hasCapability(capability)).toThrow(
			expect.objectContaining({ code: 'HOOK_CONTEXT_CLOSED' }),
		)
		expect(() => runEscapedQuery?.()).toThrow(
			expect.objectContaining({ code: 'MISSING_EXECUTION_CONTEXT' }),
		)

		await ultimabase.dispose()
	})

	it('rejects a delayed asynchronous branch after its hook scope closes', async () => {
		let releaseBranch: (() => void) | undefined
		let delayedQuery: Promise<unknown> | undefined
		const branchGate = new Promise<void>((resolve) => {
			releaseBranch = resolve
		})
		const PostSchema = Schema.define({
			className: 'HookContextDelayedBranchPost',
			fields: { title: stringField({ validation: { required: true } }) },
			hooks: {
				beforeOperation: {
					create: ({ item }) => {
						// AsyncLocalStorage retains the hook guard even though this branch
						// starts its query only after the hook callback has completed.
						delayedQuery = (async () => {
							await branchGate
							return new PostSchema({ title: 'delayed' }).create({})
						})()

						void item
					},
				},
			},
		})
		const adapter = new RecordingDatabaseAdapter(
			[createMutationResult('0198a43e-2431-7000-8000-000000000207', 'stored')],
			[],
		)
		const ultimabase = new UltimaBase({
			plugins: [createDatabasePlugin(adapter)],
			schemas: [PostSchema],
		})

		await ultimabase.start()
		await PostSchema.createOne({ data: { title: 'stored' } }, { ultimabase })

		if (delayedQuery === undefined || releaseBranch === undefined) {
			throw new TypeError('Hook did not create the delayed query branch')
		}

		const observedQuery = delayedQuery.then(
			() => undefined,
			(error: unknown) => error,
		)
		releaseBranch()

		await expect(observedQuery).resolves.toMatchObject({
			code: 'HOOK_CONTEXT_CLOSED',
		})
		expect(adapter.transactions[0]?.requests).toHaveLength(1)

		await ultimabase.dispose()
	})

	it('rejects ambient queries during transaction finalization', async () => {
		const FinalizationReadSchema = Schema.define({
			className: 'HookContextFinalizationRead',
			fields: { title: stringField() },
		})
		const PostSchema = Schema.define({
			className: 'HookContextFinalizationPost',
			fields: { title: stringField({ validation: { required: true } }) },
			hooks: {
				transaction: {
					beforeCommit: () => {
						void FinalizationReadSchema.findMany()
					},
				},
			},
		})
		const trace: string[] = []
		const ultimabase = new UltimaBase({
			plugins: [
				createDatabasePlugin(
					new RecordingDatabaseAdapter(
						[
							createMutationResult(
								'0198a43e-2431-7000-8000-000000000204',
								'stored',
							),
						],
						trace,
					),
				),
			],
			schemas: [PostSchema, FinalizationReadSchema],
		})

		await ultimabase.start()
		await expect(
			PostSchema.createOne({ data: { title: 'stored' } }, { ultimabase }),
		).rejects.toMatchObject({ code: 'MISSING_EXECUTION_CONTEXT' })
		expect(trace.at(-1)).toBe('adapter:rollback')

		await ultimabase.dispose()
	})

	it('keeps caught cross-application hook failures rollback-only', async () => {
		const ForeignSchema = Schema.define({
			className: 'HookContextForeign',
			fields: { title: stringField() },
		})
		let foreignError: unknown
		const PostSchema = Schema.define({
			className: 'HookContextCrossApplicationPost',
			fields: { title: stringField({ validation: { required: true } }) },
			hooks: {
				beforeOperation: {
					create: async ({ item }) => {
						try {
							await ForeignSchema.findMany()
						} catch (error: unknown) {
							foreignError = error
						}

						void item
					},
				},
			},
		})
		const trace: string[] = []
		const ultimabase = new UltimaBase({
			plugins: [createDatabasePlugin(new RecordingDatabaseAdapter([], trace))],
			schemas: [PostSchema],
		})

		await ultimabase.start()
		await expect(
			PostSchema.createOne({ data: { title: 'stored' } }, { ultimabase }),
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
		expect(foreignError).toMatchObject({ code: 'VALIDATION_ERROR' })
		expect(trace.at(-1)).toBe('adapter:rollback')

		await ultimabase.dispose()
	})

	it('delivers detached named events after commit in plugin order', async () => {
		const trace: string[] = []
		const deliveries: JsonObject[] = []
		const mutablePayload = { nested: { title: 'captured' } }
		const postCreatedEvent = defineEvent<JsonObject>()('post.created', {
			delivery: 'optional',
		})
		const PostSchema = Schema.define({
			className: 'HookContextEventPost',
			fields: { title: stringField({ validation: { required: true } }) },
			hooks: {
				beforeOperation: {
					create: ({ context, item }) => {
						context.emit(postCreatedEvent, mutablePayload)
						mutablePayload.nested.title = 'mutated later'

						void item
					},
				},
			},
		})
		const firstConsumer = createEventPlugin('fixture.first-event-consumer', {
			first: onEvent({
				handler: ({ event }) => {
					trace.push('event:first')
					deliveries.push(event.payload as JsonObject)
				},
				name: 'post.created',
			}),
		})
		const secondConsumer = definePlugin({
			dependencies: ['fixture.first-event-consumer'],
			name: 'fixture.second-event-consumer',
			setup: ({ registries }) => {
				registries.events.register(
					'second',
					onEvent({
						handler: ({ context, event }) => {
							trace.push('event:second')
							expect(context.transactionId).toBe(event.transactionId)
							expect(event.emittedBy.phase).toBe('beforeCreate')
						},
						name: 'post.created',
					}),
				)
			},
		})
		const adapter = new RecordingDatabaseAdapter(
			[createMutationResult('0198a43e-2431-7000-8000-000000000205', 'stored')],
			trace,
		)
		const ultimabase = new UltimaBase({
			plugins: [secondConsumer, firstConsumer, createDatabasePlugin(adapter)],
			schemas: [PostSchema],
		})

		await ultimabase.start()
		await PostSchema.createOne({ data: { title: 'stored' } }, { ultimabase })

		expect(trace.indexOf('adapter:commit')).toBeLessThan(
			trace.indexOf('event:first'),
		)
		expect(trace.slice(-2)).toStrictEqual(['event:first', 'event:second'])
		expect(deliveries).toStrictEqual([{ nested: { title: 'captured' } }])
		expect(Object.isFrozen(deliveries[0])).toBe(true)
		expect(Object.isFrozen(deliveries[0]?.nested)).toBe(true)

		await ultimabase.dispose()
	})

	it('drops optional events without consumers before queuing post-commit work', async () => {
		const trace: string[] = []
		const optionalEvent = defineEvent()('post.unobserved', {
			delivery: 'optional',
		})
		const PostSchema = Schema.define({
			className: 'HookContextUnobservedEventPost',
			fields: { title: stringField({ validation: { required: true } }) },
			hooks: {
				beforeOperation: {
					create: ({ context, item }) => {
						context.emit(optionalEvent, { title: 'stored' })

						void item
					},
				},
			},
		})
		const adapter = new RecordingDatabaseAdapter(
			[createMutationResult('0198a43e-2431-7000-8000-000000000207', 'stored')],
			trace,
		)
		const ultimabase = new UltimaBase({
			plugins: [createDatabasePlugin(adapter)],
			schemas: [PostSchema],
		})

		await ultimabase.start()
		await expect(
			PostSchema.createOne({ data: { title: 'stored' } }, { ultimabase }),
		).resolves.toMatchObject({ title: 'stored' })
		expect(trace).toContain('adapter:commit')
		await ultimabase.dispose()
	})

	it('accepts after-commit emission and continues independent consumers', async () => {
		const trace: string[] = []
		let nestedDeliveries = 0
		const postCommittedEvent = defineEvent()('post.committed', {
			delivery: 'optional',
		})
		const PostSchema = Schema.define({
			className: 'HookContextAfterCommitEventPost',
			fields: {
				title: stringField({ validation: { required: true } }),
			},
			hooks: {
				transaction: {
					afterCommit: ({ context }) => {
						trace.push('hook:afterCommit')
						context.emit(postCommittedEvent, {})
					},
				},
			},
		})
		const failingConsumer = createEventPlugin(
			'fixture.failing-committed-consumer',
			{
				failing: onEvent({
					handler: ({ context }) => {
						trace.push('event:failing')
						context.emit('post.recursive', {})
					},
					name: 'post.committed',
				}),
				nested: onEvent({
					handler: () => {
						nestedDeliveries += 1
					},
					name: 'post.recursive',
				}),
			},
		)
		const succeedingConsumer = createEventPlugin(
			'fixture.succeeding-committed-consumer',
			{
				succeeding: onEvent({
					handler: () => {
						trace.push('event:succeeding')
					},
					name: 'post.committed',
				}),
			},
		)
		const adapter = new RecordingDatabaseAdapter(
			[createMutationResult('0198a43e-2431-7000-8000-000000000206', 'stored')],
			trace,
		)
		const ultimabase = new UltimaBase({
			plugins: [
				failingConsumer,
				succeedingConsumer,
				createDatabasePlugin(adapter),
			],
			schemas: [PostSchema],
		})

		await ultimabase.start()
		await expect(
			PostSchema.createOne({ data: { title: 'stored' } }, { ultimabase }),
		).rejects.toMatchObject({
			code: 'TRANSACTION_ERROR',
			internalDetails: { reason: 'hook-event-queue-closed' },
		})
		expect(trace).toContain('adapter:commit')
		expect(trace.slice(-3)).toStrictEqual([
			'hook:afterCommit',
			'event:failing',
			'event:succeeding',
		])
		expect(nestedDeliveries).toBe(0)

		await ultimabase.dispose()
	})

	it('discards rolled-back events and rejects emission without a consumer', async () => {
		const failure = new Error('fail after emit')
		const trace: string[] = []
		let deliveries = 0
		const discardedEvent = defineEvent<{ readonly title: string }>()(
			'post.discarded',
			{ delivery: 'optional' },
		)
		const PostSchema = Schema.define({
			className: 'HookContextDiscardedEventPost',
			fields: { title: stringField({ validation: { required: true } }) },
			hooks: {
				beforeOperation: {
					create: [
						({ context, item }) => {
							context.emit(discardedEvent, { title: 'discarded' })
							void item
						},
						() => {
							throw failure
						},
					],
				},
			},
		})
		const consumer = createEventPlugin('fixture.discarded-event-consumer', {
			discarded: onEvent({
				handler: () => {
					deliveries += 1
				},
				name: 'post.discarded',
			}),
		})
		const ultimabase = new UltimaBase({
			plugins: [
				consumer,
				createDatabasePlugin(new RecordingDatabaseAdapter([], trace)),
			],
			schemas: [PostSchema],
		})

		await ultimabase.start()
		await expect(
			PostSchema.createOne({ data: { title: 'discarded' } }, { ultimabase }),
		).rejects.toBe(failure)
		expect(deliveries).toBe(0)
		expect(trace.at(-1)).toBe('adapter:rollback')
		await ultimabase.dispose()

		const requiredEvent = defineEvent()('missing.consumer', {
			delivery: 'required',
		})
		const MissingConsumerSchema = Schema.define({
			className: 'HookContextMissingConsumer',
			fields: { title: stringField() },
			hooks: {
				beforeOperation: {
					create: ({ context, item }) => {
						context.emit(requiredEvent, {})
						void item
					},
				},
			},
		})
		const missingConsumerApp = new UltimaBase({
			plugins: [createDatabasePlugin(new RecordingDatabaseAdapter([], []))],
			schemas: [MissingConsumerSchema],
		})

		await missingConsumerApp.start()
		await expect(
			MissingConsumerSchema.createOne(
				{ data: { title: 'rejected' } },
				{ ultimabase: missingConsumerApp },
			),
		).rejects.toMatchObject({ code: 'SERVICE_NOT_FOUND' })
		await missingConsumerApp.dispose()
	})
})
