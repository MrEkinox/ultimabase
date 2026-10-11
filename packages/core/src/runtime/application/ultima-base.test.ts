import { applicationFixture } from '../../../tests/application-fixture.js'
import { plugin as createPlugin } from '../../plugins/plugin.js'
import {
	contributeApplication,
	withPluginPrivileges,
} from '../../plugins/plugin-contributions.js'

import { describe, expect, it } from 'vitest'

import { type DatabaseAdapter } from '../database/contracts.js'
import { provideRuntimeBehavior } from '../capabilities.js'
import { getOperationSchema } from '../operations/schema.js'
import { RequestContext, requestSources } from '../context/request-context.js'
import { runWithRequestEngine } from '../context/active-framework-context.js'
import { MasterAuthority } from '../master/master-authority.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import { UltimaBase } from './ultima-base.js'
import { anonymous, withContext } from './plugin-authority.js'
import { RequestContextValue } from '../../plugin.js'

const articleSchema = UltimaBase.Schema.define({
	className: 'UltimaBaseArticle',
	fields: (field) => ({
		title: field.string({
			indexed: 'unique',
			required: true,
		}),
	}),
})

const principalValue = new RequestContextValue<string>(
	'fixture.auth.principal',
	(value: unknown): string => {
		if (typeof value !== 'string') {
			throw new TypeError('Fixture principal must be a string')
		}

		return value
	},
)

const createDatabasePlugin = (
	adapter: DatabaseAdapter,
	options: {
		readonly onContext?: (context: RequestContext) => void
		readonly trace?: string[]
	} = {},
) =>
	createPlugin({
		version: '0.0.0',
		core: '^0.0.0',
		id: 'fixture.ultimabase-database',
		permissions: {
			'runtime:intercept': 'Exercises low-level request context observation.',
		},
		contributions: [
			provideTestDatabaseAdapter(adapter),
			...(options.onContext === undefined
				? []
				: [
						provideRuntimeBehavior({
							contributionId: 'fixture.ultimabase-context',
							create: () => ({
								value: {
									beforeOperation: ({ context, operation }) => {
										if (
											operation.kind === 'find-many' &&
											getOperationSchema(operation) === articleSchema
										) {
											options.onContext?.(context)
										}
									},
								},
							}),
						}),
					]),
			withPluginPrivileges(
				contributeApplication((context) => {
					options.trace?.push('setup')
					const exports = undefined
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return {
						exports,
						connect: () => {
							;(() => {
								options.trace?.push('connect')
							})()
						},
						stop: () => {
							;(() => {
								options.trace?.push('stop')
							})()
						},
						dispose: () => {
							;(() => {
								options.trace?.push('dispose')
							})()
						},
					}
				}),
				['runtime:intercept'],
			),
		],
	})

describe('UltimaBase', () => {
	it('starts lifecycle-only applications without manufacturing a Runtime', async () => {
		const trace: string[] = []
		const lifecyclePlugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.ultimabase-lifecycle-only',
			version: '0.0.0',
			contributions: [
				contributeApplication(() => ({
					exports: undefined,
					connect: () => {
						trace.push('connect')
					},
					dispose: () => {
						trace.push('dispose')
					},
				})),
			],
		})
		const ultimabase = applicationFixture(
			new (UltimaBase.use(lifecyclePlugin))({ schemas: [] }),
		)

		await ultimabase.start()
		expect(ultimabase.state).toBe('started')
		expect(trace).toStrictEqual(['connect'])
		expect(() =>
			anonymous(ultimabase, { requestId: 'no-runtime', source: 'internal' }),
		).toThrow('UltimaBase must be started before request execution')

		await ultimabase.dispose()
		expect(trace).toStrictEqual(['connect', 'dispose'])
	})

	it('starts lazily and executes concise direct queries as anonymous internal requests', async () => {
		const rows = [
			{
				id: '0198a43e-2431-7000-8000-000000000001',
				title: 'Facade result',
				createdAt: '2026-08-02T08:00:00.000Z',
				updatedAt: '2026-08-02T08:00:00.000Z',
			},
		]
		const adapter = new RecordingDatabaseAdapter(
			[{ status: 'fulfilled', value: rows }],
			[],
		)
		const trace: string[] = []
		let observedContext: RequestContext | undefined
		const validation = { timezone: 'UTC' }
		const databasePlugin = createDatabasePlugin(adapter, {
			onContext: (context) => {
				observedContext = context
			},
			trace,
		})
		const ultimabase = applicationFixture(
			new (UltimaBase.use(databasePlugin))({
				schemas: [articleSchema],
				validation,
			}),
		)
		validation.timezone = ''

		expect(ultimabase.state).toBe('idle')
		expect(trace).toStrictEqual([])
		expect(Object.isFrozen(ultimabase)).toBe(true)
		expect(() =>
			anonymous(ultimabase, { requestId: 'early', source: 'internal' }),
		).toThrow(
			new TypeError('UltimaBase must be started before request execution'),
		)
		expect(() => articleSchema.findMany()).toThrow(
			expect.objectContaining({ code: 'MISSING_EXECUTION_CONTEXT' }),
		)

		const start = ultimabase.start()

		expect(ultimabase.start()).toBe(start)
		await start
		expect(ultimabase.state).toBe('started')
		expect(trace).toStrictEqual(['setup', 'connect'])
		ultimabase.plugin(databasePlugin)
		expect(() => {
			ultimabase.plugin(createDatabasePlugin(adapter))
		}).toThrow('Plugin setup has not completed: fixture.ultimabase-database')

		const result = await articleSchema.findMany()

		expect(result).toHaveLength(1)
		// Results are frozen plain objects (ADR-0310).
		expect(Object.getPrototypeOf(result[0])).toBe(Object.prototype)
		expect(Object.isFrozen(result[0])).toBe(true)
		expect(result).toStrictEqual(rows)
		expect(result).not.toBe(rows)
		expect(Object.isFrozen(result)).toBe(true)
		expect(observedContext?.signal).toBeInstanceOf(AbortSignal)
		expect(observedContext?.requestId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
		)

		await ultimabase.stop()
		expect(ultimabase.state).toBe('stopped')
		expect(trace).toStrictEqual(['setup', 'connect', 'stop'])
		expect(() => articleSchema.findMany({})).toThrow(
			new TypeError(
				'Framework engine requires its initialized active application; received stopped',
			),
		)
		expect(() => ultimabase.start()).toThrow(
			new TypeError('Cannot start UltimaBase while application is stopped'),
		)

		await ultimabase[Symbol.asyncDispose]()
		await ultimabase.dispose()
		expect(trace).toStrictEqual(['setup', 'connect', 'stop', 'dispose'])
	})

	it('disposes a scoped application through await using', async () => {
		const trace: string[] = []
		const adapter = new RecordingDatabaseAdapter([], [])
		let scoped:
			| UltimaBase<
					readonly [typeof articleSchema],
					readonly [ReturnType<typeof createDatabasePlugin>]
			  >
			| undefined
		{
			await using ultimabase = new (UltimaBase.use(
				createDatabasePlugin(adapter, { trace }),
			))({ schemas: [articleSchema] })
			scoped = ultimabase
			await ultimabase.start()
			expect(ultimabase.state).toBe('started')
		}
		expect(scoped.state).toBe('disposed')
		expect(trace).toStrictEqual(['setup', 'connect', 'stop', 'dispose'])
	})

	it('keeps results as data and rejects foreign schema identities after sequential replacement', async () => {
		const row = {
			createdAt: '2026-08-02T08:00:00.000Z',
			id: '0198a43e-2431-7000-8000-000000000002',
			title: 'First lifetime',
			updatedAt: '2026-08-02T08:00:00.000Z',
		}
		const firstAdapter = new RecordingDatabaseAdapter(
			[{ status: 'fulfilled', value: [row] }],
			[],
		)
		const first = applicationFixture(
			new (UltimaBase.use(createDatabasePlugin(firstAdapter)))({
				logger: false,
				schemas: [articleSchema],
			}),
		)
		await first.start()
		const [stale] = await articleSchema.findMany()
		if (stale === undefined)
			throw new TypeError('Expected one persisted result')
		await first.dispose()

		const secondAdapter = new RecordingDatabaseAdapter([], [])
		const second = applicationFixture(
			new (UltimaBase.use(createDatabasePlugin(secondAdapter)))({
				logger: false,
				schemas: [articleSchema],
			}),
		)
		await second.start()
		// A result of a disposed lifetime is plain data bound to nothing.
		expect(stale).toStrictEqual(row)

		const ForeignArticle = UltimaBase.Schema.define({
			className: articleSchema.className,
			fields: (field) => ({ title: field.string() }),
		})
		await expect(ForeignArticle.findMany()).rejects.toThrow(
			'Schema does not belong to this application',
		)
		expect(secondAdapter.rootRequests).toStrictEqual([])
	})

	it('executes direct plugin contexts and audited master operation options', async () => {
		const adapter = new RecordingDatabaseAdapter(
			[
				{ status: 'fulfilled', value: [] },
				{ status: 'fulfilled', value: [] },
			],
			[],
		)
		const observedAccesses: RequestContext['access'][] = []
		const observedPrincipals: (string | undefined)[] = []
		const auditEvents: unknown[] = []
		const authority = new MasterAuthority({
			clock: () => new Date('2026-08-03T12:00:00.000Z'),
			keys: [{ id: 'server-default', value: 'unused-by-terminal' }],
			onUse: (event) => {
				auditEvents.push(event)
			},
		})
		const ultimabase = applicationFixture(
			new (UltimaBase.use(
				createDatabasePlugin(adapter, {
					onContext: (context) => {
						// Runtime callbacks observe immutable request capabilities.
						observedAccesses.push(context.access)
						observedPrincipals.push(context.getValue(principalValue))
					},
				}),
			))({
				masterAuthority: authority,
				schemas: [articleSchema],
			}),
		)
		const context = RequestContext.anonymous({
			requestId: 'plugin-context-1',
			source: requestSources.internal,
		}).withValue(principalValue, 'user-1')

		try {
			await ultimabase.start()
			await articleSchema.findMany(undefined, { context })
			await articleSchema.findMany(undefined, {
				context,
				useMasterKey: true,
			})

			expect(observedAccesses).toHaveLength(2)
			expect(observedAccesses[0]).toStrictEqual({ mode: 'anonymous' })
			expect(observedPrincipals[0]).toBe('user-1')
			expect(observedAccesses[1]).toStrictEqual({
				keyId: 'server-default',
				mode: 'master',
				reason: 'Schema command find-many on UltimaBaseArticle',
			})
			expect(observedPrincipals[1]).toBe('user-1')
			expect(auditEvents).toStrictEqual([
				{
					keyId: 'server-default',
					kind: 'master-access',
					occurredAt: '2026-08-03T12:00:00.000Z',
					previousAccess: { mode: 'anonymous' },
					reason: 'Schema command find-many on UltimaBaseArticle',
					requestId: 'plugin-context-1',
					source: 'internal',
				},
			])
			expect(adapter.rootRequests).toHaveLength(2)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('runs every write through exact schema commands', async () => {
		const createdRecord = {
			createdAt: '2026-08-03T12:00:00.000Z',
			id: '0198a43e-2431-7000-8000-000000000011',
			title: 'Created',
			updatedAt: '2026-08-03T12:00:00.000Z',
		}
		const upsertedRecord = {
			...createdRecord,
			id: '0198a43e-2431-7000-8000-000000000012',
			title: 'Upserted',
		}
		const updatedRecord = { ...createdRecord, title: 'Updated' }
		const adapter = new RecordingDatabaseAdapter(
			[
				{
					materializations: [{ current: createdRecord, kind: 'create' }],
					status: 'fulfilled',
					value: createdRecord,
				},
				{
					materializations: [
						{
							current: upsertedRecord,
							kind: 'update',
							previous: { ...upsertedRecord, title: 'Imported' },
						},
					],
					status: 'fulfilled',
					value: upsertedRecord,
				},
				{
					materializations: [
						{
							current: updatedRecord,
							kind: 'update',
							previous: createdRecord,
						},
					],
					status: 'fulfilled',
					target: createdRecord,
					value: updatedRecord,
				},
				{
					materializations: [{ kind: 'delete', previous: updatedRecord }],
					status: 'fulfilled',
					target: updatedRecord,
					value: updatedRecord,
				},
			],
			[],
		)
		const ultimabase = applicationFixture(
			new (UltimaBase.use(createDatabasePlugin(adapter)))({
				schemas: [articleSchema],
			}),
		)
		try {
			await ultimabase.start()
			const created = await articleSchema.createOne({
				data: { title: 'Created' },
			})
			const upserted = await articleSchema.upsertOne({
				create: { title: 'Imported' },
				update: { title: 'Upserted' },
				where: { title: { eq: 'Imported' } },
			})
			const updated = await articleSchema.updateOne({
				where: { id: created.id },
				data: { title: 'Updated' },
			})
			const deleted = await articleSchema.deleteOne({
				where: { id: created.id },
			})

			expect(created).toStrictEqual(createdRecord)
			expect(upserted).toStrictEqual(upsertedRecord)
			expect(updated).toStrictEqual(updatedRecord)
			expect(deleted).toStrictEqual(updatedRecord)
			expect(
				adapter.transactions.flatMap((transaction) =>
					transaction.requests.map((request) => request.operation.kind),
				),
			).toStrictEqual(['create-one', 'upsert-one', 'update-one', 'delete-one'])
			const updateOperation = adapter.transactions[2]?.requests[0]?.operation
			const deleteOperation = adapter.transactions[3]?.requests[0]?.operation

			expect(updateOperation).toMatchObject({
				kind: 'update-one',
				query: {
					where: {
						expression: { field: 'id', kind: 'equal', value: createdRecord.id },
					},
				},
			})
			expect(deleteOperation).toMatchObject({
				kind: 'delete-one',
				query: {
					where: {
						expression: { field: 'id', kind: 'equal', value: createdRecord.id },
					},
				},
			})
		} finally {
			await ultimabase.dispose()
		}
	})

	it('fails before execution when terminal master authority is unavailable', async () => {
		const missingAdapter = new RecordingDatabaseAdapter([], [])
		const missing = applicationFixture(
			new (UltimaBase.use(createDatabasePlugin(missingAdapter)))({
				schemas: [articleSchema],
			}),
		)
		const auditFailure = new Error('master audit unavailable')
		const failingAdapter = new RecordingDatabaseAdapter([], [])
		const failing = applicationFixture(
			new (UltimaBase.use(createDatabasePlugin(failingAdapter)))({
				masterAuthority: new MasterAuthority({
					keys: [{ id: 'failing-default', value: 'unused-by-terminal' }],
					onUse: () => {
						throw auditFailure
					},
				}),
				schemas: [articleSchema],
			}),
		)

		try {
			await missing.start()

			await expect(
				articleSchema.findMany(undefined, {
					useMasterKey: true,
				}),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			await missing.dispose()
			await failing.start()
			await expect(
				articleSchema.findMany(undefined, {
					useMasterKey: true,
				}),
			).rejects.toBe(auditFailure)
			expect(missingAdapter.rootRequests).toStrictEqual([])
			expect(failingAdapter.rootRequests).toStrictEqual([])
		} finally {
			await Promise.all([missing.dispose(), failing.dispose()])
		}
	})

	it('reuses an active same-application transaction and isolates other applications', async () => {
		const firstAdapter = new RecordingDatabaseAdapter(
			[
				{
					materializations: [
						{
							kind: 'create',
							current: {
								id: '0198a43e-2431-7000-8000-000000000002',
								title: 'Transactional',
								createdAt: '2026-08-02T08:00:00.000Z',
								updatedAt: '2026-08-02T08:00:00.000Z',
							},
						},
					],
					status: 'fulfilled',
					value: {
						id: '0198a43e-2431-7000-8000-000000000002',
						title: 'Transactional',
						createdAt: '2026-08-02T08:00:00.000Z',
						updatedAt: '2026-08-02T08:00:00.000Z',
					},
				},
			],
			[],
		)
		const otherSchema = UltimaBase.Schema.define({
			className: 'OtherUltimaBaseArticle',
			fields: (field) => ({ title: field.string() }),
		})
		const secondAdapter = new RecordingDatabaseAdapter([], [])
		const first = applicationFixture(
			new (UltimaBase.use(createDatabasePlugin(firstAdapter)))({
				schemas: [articleSchema],
			}),
		)
		const second = applicationFixture(
			new (UltimaBase.use(createDatabasePlugin(secondAdapter)))({
				schemas: [otherSchema],
			}),
		)

		try {
			await first.start()
			const foreignContext = RequestContext.anonymous({
				requestId: 'foreign-context',
				source: requestSources.internal,
			})

			withContext(first, foreignContext)

			await anonymous(first, {
				requestId: 'transaction-owner',
				source: 'internal',
			}).transaction(async () =>
				articleSchema.createOne({ data: { title: 'Transactional' } }),
			)

			expect(firstAdapter.rootRequests).toStrictEqual([])
			expect(firstAdapter.transactions).toHaveLength(1)
			expect(firstAdapter.transactions[0]?.requests).toHaveLength(1)
			await expect(otherSchema.findMany(undefined)).rejects.toMatchObject({
				code: 'VALIDATION_ERROR',
			})
			await runWithRequestEngine(
				anonymous(first, {
					requestId: 'active-first',
					source: requestSources.internal,
				}),
				() =>
					expect(otherSchema.findMany()).rejects.toMatchObject({
						code: 'VALIDATION_ERROR',
					}),
			)
			await first.dispose()
			await second.start()
			await expect(
				otherSchema.findMany(undefined, {
					context: foreignContext,
				}),
			).rejects.toMatchObject({
				code: 'VALIDATION_ERROR',
				internalDetails: {
					reason: 'operation-context-application-mismatch',
				},
			})

			expect(second.ownsSchema(articleSchema)).toBe(false)
		} finally {
			await Promise.all([first.dispose(), second.dispose()])
		}
	})

	it('cleans initialized plugins when Runtime assembly fails', async () => {
		const trace: string[] = []
		const plugin = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.ultimabase-missing-adapter',
			contributions: [
				provideTestDatabaseAdapter({} as never),
				contributeApplication((context) => {
					trace.push('setup')
					const exports = undefined
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return {
						exports,
						dispose: () => {
							;(() => {
								trace.push('dispose')
							})()
						},
					}
				}),
			],
		})
		const ultimabase = applicationFixture(
			new (UltimaBase.use(plugin))({ schemas: [articleSchema] }),
		)

		await expect(ultimabase.start()).rejects.toThrow(
			new TypeError(
				'databaseAdapterCapability must resolve to a DatabaseAdapter',
			),
		)
		expect(ultimabase.state).toBe('disposed')
		expect(trace).toStrictEqual(['setup', 'dispose'])
	})

	it('rejects malformed JavaScript options before plugin setup', () => {
		expect(() => {
			// @ts-expect-error -- Runtime validation protects non-object callers.
			applicationFixture(new UltimaBase(null))
		}).toThrow(new TypeError('UltimaBase options must be a plain object'))
		expect(() =>
			applicationFixture(
				new UltimaBase({
					schemas: [],
					// @ts-expect-error -- Runtime validation protects unknown options.
					unknown: true,
				}),
			),
		).toThrow(new TypeError('UltimaBase contains unknown option: unknown'))
		expect(() =>
			applicationFixture(
				new UltimaBase({ schemas: [], validation: { timezone: '' } }),
			),
		).toThrow(
			new TypeError('Runtime validation timezone must be a non-empty string'),
		)
	})
})
