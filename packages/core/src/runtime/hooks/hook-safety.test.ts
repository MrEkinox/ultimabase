import { definePlugin, FrameworkError } from '../../foundation.js'
import { Schema, stringField } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { RequestContext, requestSources } from '../context/request-context.js'
import {
	databaseAdapterServiceToken,
	type DatabaseAdapter,
} from '../database/contracts.js'
import {
	getCurrentEngine,
	runWithRequestEngine,
} from '../context/active-framework-context.js'
import { UltimaBase } from '../application/ultima-base.js'
import {
	RecordingDatabaseAdapter,
	type QueuedAdapterResult,
} from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { beforeOperation } from './definitions.js'
import {
	hookDiagnosticsObserverServiceToken,
	type HookDiagnosticEvent,
	type HookDiagnosticsObserver,
} from './diagnostics.js'

const createDatabasePlugin = (
	adapter: DatabaseAdapter,
	observer?: HookDiagnosticsObserver,
) =>
	definePlugin({
		name: 'fixture.hook-safety-database',
		slot: 'database-adapter',
		setup: ({ services }) => {
			services.provide(databaseAdapterServiceToken, adapter)

			if (observer !== undefined) {
				services.provide(hookDiagnosticsObserverServiceToken, observer)
			}
		},
	})

const createStoredArticle = (id: string, title: string) => ({
	createdAt: '2026-08-02T20:00:00.000Z',
	id,
	title,
	updatedAt: '2026-08-02T20:00:00.000Z',
})

const createMutationResult = (
	id: string,
	title: string,
): QueuedAdapterResult => {
	const current = createStoredArticle(id, title)

	return {
		materializations: [{ current, kind: 'create' }],
		status: 'fulfilled',
		value: current,
	}
}

describe('hook execution safety', () => {
	it('stops remaining hooks and rolls an automatic transaction back on cancellation', async () => {
		const controller = new AbortController()
		const events: HookDiagnosticEvent[] = []
		const trace: string[] = []
		const transactionIds: (string | undefined)[] = []
		const schema = Schema.define({
			className: 'CancelledHookArticle',
			fields: {
				title: stringField({ validation: { required: true } }),
			},
			hooks: {
				beforeCreate: [
					({ context, operation }) => {
						trace.push('hook:first')
						transactionIds.push(context.transactionId)
						controller.abort()

						return operation
					},
					({ operation }) => {
						trace.push('hook:second')

						return operation
					},
				],
				afterRollback: ({ context }) => {
					trace.push('hook:afterRollback')
					transactionIds.push(context.transactionId)
				},
				onError: ({ context }) => {
					trace.push('hook:onError')
					transactionIds.push(context.transactionId)
				},
			},
		})
		const adapter = new RecordingDatabaseAdapter([], trace)
		const ultimabase = new UltimaBase({
			plugins: [
				createDatabasePlugin(adapter, (event) => {
					events.push(event)
				}),
			],
			schemas: [schema],
		})

		await ultimabase.start()
		const engine = ultimabase.engine.withContext(
			RequestContext.anonymous({
				requestId: 'cancelled-mutation',
				signal: controller.signal,
				source: requestSources.internal,
			}),
		)

		await expect(
			runWithRequestEngine(engine, () =>
				schema.createOne({ data: { title: 'cancel me' } }),
			),
		).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })

		expect(trace).toStrictEqual([
			'adapter:begin',
			'hook:first',
			'adapter:rollback',
			'hook:afterRollback',
			'hook:onError',
		])
		expect(adapter.transactions[0]?.requests).toStrictEqual([])
		expect(transactionIds).toHaveLength(3)
		expect(transactionIds[0]).toMatch(/^[0-9a-f-]{36}$/u)
		expect(new Set(transactionIds).size).toBe(1)
		expect(
			events
				.filter(({ phase }) => phase === 'afterRollback' || phase === 'onError')
				.map(({ phase, status, transactionId }) => ({
					phase,
					status,
					transactionId,
				})),
		).toStrictEqual([
			{
				phase: 'afterRollback',
				status: 'succeeded',
				transactionId: transactionIds[0],
			},
			{
				phase: 'onError',
				status: 'succeeded',
				transactionId: transactionIds[0],
			},
		])

		await ultimabase.dispose()
	})

	it('rejects a pre-aborted mutation before opening its transaction', async () => {
		const controller = new AbortController()
		const trace: string[] = []
		const schema = Schema.define({
			className: 'PreCancelledHookArticle',
			fields: { title: stringField() },
		})
		const adapter = new RecordingDatabaseAdapter([], trace)
		const ultimabase = new UltimaBase({
			plugins: [createDatabasePlugin(adapter)],
			schemas: [schema],
		})

		await ultimabase.start()
		controller.abort()
		const engine = ultimabase.engine.withContext(
			RequestContext.anonymous({
				requestId: 'pre-cancelled-mutation',
				signal: controller.signal,
				source: requestSources.internal,
			}),
		)

		await expect(
			runWithRequestEngine(engine, () =>
				schema.createOne({ data: { title: 'never starts' } }),
			),
		).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
		expect(adapter.transactions).toStrictEqual([])
		expect(trace).toStrictEqual([])

		await ultimabase.dispose()
	})

	it('allows cross-schema nested hooks and retains one transaction identity', async () => {
		const trace: string[] = []
		const transactionIds: (string | undefined)[] = []
		const childSchema = Schema.define({
			className: 'NestedHookChild',
			fields: { title: stringField({ validation: { required: true } }) },
			hooks: {
				beforeCreate: ({ context, operation }) => {
					trace.push('hook:child')
					transactionIds.push(context.transactionId)

					return operation
				},
			},
		})
		const parentSchema = Schema.define({
			className: 'NestedHookParent',
			fields: { title: stringField({ validation: { required: true } }) },
			hooks: {
				afterCommit: ({ context }) => {
					trace.push('hook:parent:afterCommit')
					transactionIds.push(context.transactionId)
				},
				beforeCreate: async ({ context, operation }) => {
					trace.push('hook:parent')
					transactionIds.push(context.transactionId)
					await childSchema.createOne({ data: { title: 'child' } })

					return operation
				},
			},
		})
		const adapter = new RecordingDatabaseAdapter(
			[
				createMutationResult('0198a43e-2431-7000-8000-000000000101', 'child'),
				createMutationResult('0198a43e-2431-7000-8000-000000000102', 'parent'),
			],
			trace,
		)
		const plugin = createDatabasePlugin(adapter)

		const ultimabase = new UltimaBase({
			plugins: [plugin],
			schemas: [parentSchema, childSchema],
		})
		await ultimabase.start()

		await expect(
			parentSchema.createOne({ data: { title: 'parent' } }, { ultimabase }),
		).resolves.toMatchObject({ title: 'parent' })

		expect(transactionIds).toHaveLength(3)
		expect(transactionIds[0]).toBe(transactionIds[1])
		expect(transactionIds[0]).toMatch(/^[0-9a-f-]{36}$/u)
		expect(adapter.transactions).toHaveLength(1)
		expect(adapter.transactions[0]?.requests).toHaveLength(2)
		expect(trace).toContain('adapter:commit')

		await ultimabase.dispose()
	})

	it('rejects recursion reached through a nested engine operation', async () => {
		const trace: string[] = []
		const schema = Schema.define({
			className: 'RecursiveHookArticle',
			fields: { title: stringField({ validation: { required: true } }) },
			hooks: {
				beforeCreate: async ({ operation }) => {
					trace.push('hook:beforeCreate')
					await schema.createOne({ data: { title: 'nested' } })

					return operation
				},
			},
		})
		const adapter = new RecordingDatabaseAdapter([], trace)
		const plugin = createDatabasePlugin(adapter)

		const ultimabase = new UltimaBase({
			plugins: [plugin],
			schemas: [schema],
		})
		await ultimabase.start()

		await expect(
			schema.createOne({ data: { title: 'root' } }, { ultimabase }),
		).rejects.toMatchObject({ code: 'HOOK_RECURSION' })
		expect(trace).toStrictEqual([
			'adapter:begin',
			'hook:beforeCreate',
			'adapter:rollback',
		])

		await ultimabase.dispose()
	})

	it('protects low-level plugin hooks from nested operation recursion', async () => {
		const trace: string[] = []
		const schema = Schema.define({
			className: 'RecursiveLowLevelArticle',
			fields: { title: stringField({ validation: { required: true } }) },
		})
		const defineRecursivePlugin = () =>
			definePlugin({
				name: 'fixture.recursive-low-level-hook',
				setup: ({ registries }) => {
					registries.hooks.register(
						'fixture.recursive-before-operation',
						beforeOperation({
							handler: async ({ operation }) => {
								trace.push('hook:before-operation')
								await schema.createOne({ data: { title: 'nested' } })

								return { operation }
							},
							operations: ['create-one'],
							schema,
						}),
					)
				},
			})
		const adapter = new RecordingDatabaseAdapter([], trace)
		const ultimabase = new UltimaBase({
			plugins: [createDatabasePlugin(adapter), defineRecursivePlugin()],
			schemas: [schema],
		})

		await ultimabase.start()
		await expect(
			schema.createOne({ data: { title: 'root' } }, { ultimabase }),
		).rejects.toMatchObject({ code: 'HOOK_RECURSION' })
		expect(trace).toStrictEqual([
			'adapter:begin',
			'hook:before-operation',
			'adapter:rollback',
		])

		await ultimabase.dispose()
	})

	it('emits redacted diagnostics outside request scope without trusting observers', async () => {
		const events: HookDiagnosticEvent[] = []
		let observerHadRequestAuthority = false
		const schema = Schema.define({
			className: 'ObservedHookArticle',
			fields: { title: stringField() },
			hooks: {
				beforeRead: ({ query }) => query,
			},
		})
		const adapter = new RecordingDatabaseAdapter(
			[{ status: 'fulfilled', value: [] }],
			[],
		)
		const observer: HookDiagnosticsObserver = (event) => {
			events.push(event)

			try {
				getCurrentEngine()
				observerHadRequestAuthority = true
			} catch (error: unknown) {
				if (
					!(error instanceof FrameworkError) ||
					error.code !== 'MISSING_EXECUTION_CONTEXT'
				) {
					throw error
				}
			}

			throw new Error('diagnostic observer failure')
		}
		const runtimePlugin = definePlugin({
			name: 'fixture.observed-low-level-hook',
			setup: ({ registries }) => {
				registries.hooks.register(
					'fixture.observed-before',
					beforeOperation({
						schema,
						handler: ({ operation }) => ({ operation }),
					}),
				)
			},
		})
		const ultimabase = new UltimaBase({
			plugins: [createDatabasePlugin(adapter, observer), runtimePlugin],
			schemas: [schema],
		})

		await ultimabase.start()
		const engine = ultimabase.engine.withContext(
			RequestContext.anonymous({
				metadata: { token: 'diagnostic-secret' },
				requestId: 'observed-request',
				source: requestSources.internal,
			}),
		)

		await expect(
			runWithRequestEngine(engine, () => schema.query().findMany()),
		).resolves.toStrictEqual([])
		expect(events.map(({ phase }) => phase)).toStrictEqual([
			'before-operation',
			'beforeRead',
		])
		expect(events.every(Object.isFrozen)).toBe(true)
		expect(
			events.every(({ transactionId }) => transactionId === undefined),
		).toBe(true)
		expect(JSON.stringify(events)).not.toContain('diagnostic-secret')
		expect(observerHadRequestAuthority).toBe(false)

		await ultimabase.dispose()
	})
})
