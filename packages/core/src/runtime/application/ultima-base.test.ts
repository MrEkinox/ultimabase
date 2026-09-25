import { applicationFixture } from '../../../tests/application-fixture.js'
import { definePlugin } from '../../foundation.js'
import { RequestContextValue } from '../../access/index.js'
import { Schema } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'
import { QueryBuilder } from '../../query/query/query.js'

import { type DatabaseAdapter } from '../database/contracts.js'
import { beforeOperation } from '../contributions/definitions.js'
import { RequestContext, requestSources } from '../context/request-context.js'
import { runWithRequestEngine } from '../context/active-framework-context.js'
import { MasterAuthority } from '../master/master-authority.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import { provideTestRuntimeInterceptor } from '../../../tests/runtime/fixtures/runtime-capabilities.js'
import { UltimaBase } from './ultima-base.js'

const articleSchema = Schema.define({
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
	definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: 'fixture.ultimabase-database',
		privileges: [
			{
				name: 'runtime:intercept',
				reason: 'Exercises low-level request context observation.',
			},
		],
		capabilities: {
			provides: [
				provideTestDatabaseAdapter(adapter),
				...(options.onContext === undefined
					? []
					: [
							provideTestRuntimeInterceptor(
								'fixture.ultimabase-context',
								beforeOperation({
									schema: articleSchema,
									operations: ['find-many'],
									handler: ({ context }) => {
										options.onContext?.(context)
									},
								}),
							),
						]),
			],
		},
		setup: () => {
			options.trace?.push('setup')
		},
		hooks: {
			connect: () => {
				options.trace?.push('connect')
			},
			stop: () => {
				options.trace?.push('stop')
			},
			dispose: () => {
				options.trace?.push('dispose')
			},
		},
	})

describe('UltimaBase', () => {
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
			new UltimaBase({
				schemas: [articleSchema],
				plugins: [databasePlugin],
				validation,
			}),
		)
		validation.timezone = ''

		expect(ultimabase.state).toBe('idle')
		expect(trace).toStrictEqual([])
		expect(Object.isFrozen(ultimabase)).toBe(true)
		expect(() => ultimabase.engine).toThrow(
			new TypeError('UltimaBase must be started before accessing its engine'),
		)
		expect(() => articleSchema.findMany(undefined, { ultimabase })).toThrow(
			new TypeError('UltimaBase must be started before accessing its engine'),
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

		const result = await articleSchema.findMany(undefined, { ultimabase })

		expect(result).toHaveLength(1)
		expect(result[0]).toBeInstanceOf(articleSchema)
		expect(result.map((article) => article.toJSON())).toStrictEqual(rows)
		expect(result).not.toBe(rows)
		expect(Object.isFrozen(result)).toBe(true)
		expect(observedContext?.signal).toBeInstanceOf(AbortSignal)
		expect(observedContext?.requestId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
		)

		const escapedQuery = new QueryBuilder(articleSchema)

		await ultimabase.stop()
		expect(ultimabase.state).toBe('stopped')
		expect(trace).toStrictEqual(['setup', 'connect', 'stop'])
		expect(() =>
			articleSchema.findMany(escapedQuery.build(), { ultimabase }),
		).toThrow(
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
			await using ultimabase = new UltimaBase({
				schemas: [articleSchema],
				plugins: [createDatabasePlugin(adapter, { trace })],
			})
			scoped = ultimabase
			await ultimabase.start()
			expect(ultimabase.state).toBe('started')
		}
		expect(scoped.state).toBe('disposed')
		expect(trace).toStrictEqual(['setup', 'connect', 'stop', 'dispose'])
	})

	it('executes explicit plugin contexts and audited master operation options', async () => {
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
			new UltimaBase({
				masterAuthority: authority,
				schemas: [articleSchema],
				plugins: [
					createDatabasePlugin(adapter, {
						onContext: (context) => {
							// Runtime callbacks observe immutable request capabilities.
							observedAccesses.push(context.access)
							observedPrincipals.push(context.getValue(principalValue))
						},
					}),
				],
			}),
		)
		const context = RequestContext.anonymous({
			requestId: 'plugin-context-1',
			source: requestSources.internal,
		}).withValue(principalValue, 'user-1')

		try {
			await ultimabase.start()
			await articleSchema.findMany(undefined, { context, ultimabase })
			await articleSchema.findMany(undefined, {
				context,
				ultimabase,
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

	it('delegates immutable model commands through exact schema operations', async () => {
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
			new UltimaBase({
				plugins: [createDatabasePlugin(adapter)],
				schemas: [articleSchema],
			}),
		)
		const draft = new articleSchema({ title: 'Created' })
		const importedDraft = new articleSchema({ title: 'Imported' })

		try {
			await ultimabase.start()
			const created = await draft.create({}, { ultimabase })
			const upserted = await importedDraft.upsert(
				{
					update: { title: 'Upserted' },
					where: { title: { eq: 'Imported' } },
				},
				{ ultimabase },
			)
			const updated = await created.update(
				{ data: { title: 'Updated' } },
				{ ultimabase },
			)
			const deleted = await updated.delete({}, { ultimabase })

			expect(draft.toJSON()).toStrictEqual({ title: 'Created' })
			expect(importedDraft.toJSON()).toStrictEqual({ title: 'Imported' })
			expect(created).not.toBe(draft)
			expect(upserted).not.toBe(importedDraft)
			expect(updated).not.toBe(created)
			expect(deleted).not.toBe(updated)
			expect(created.toJSON()).toStrictEqual(createdRecord)
			expect(upserted.toJSON()).toStrictEqual(upsertedRecord)
			expect(updated.toJSON()).toStrictEqual(updatedRecord)
			expect(deleted.toJSON()).toStrictEqual(updatedRecord)
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
			new UltimaBase({
				schemas: [articleSchema],
				plugins: [createDatabasePlugin(missingAdapter)],
			}),
		)
		const auditFailure = new Error('master audit unavailable')
		const failingAdapter = new RecordingDatabaseAdapter([], [])
		const failing = applicationFixture(
			new UltimaBase({
				masterAuthority: new MasterAuthority({
					keys: [{ id: 'failing-default', value: 'unused-by-terminal' }],
					onUse: () => {
						throw auditFailure
					},
				}),
				schemas: [articleSchema],
				plugins: [createDatabasePlugin(failingAdapter)],
			}),
		)

		try {
			await missing.start()

			await expect(
				articleSchema.findMany(undefined, {
					ultimabase: missing,
					useMasterKey: true,
				}),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			await missing.dispose()
			await failing.start()
			await expect(
				articleSchema.findMany(undefined, {
					ultimabase: failing,
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
		const otherSchema = Schema.define({
			className: 'OtherUltimaBaseArticle',
			fields: (field) => ({ title: field.string() }),
		})
		const secondAdapter = new RecordingDatabaseAdapter([], [])
		const first = applicationFixture(
			new UltimaBase({
				schemas: [articleSchema],
				plugins: [createDatabasePlugin(firstAdapter)],
			}),
		)
		const second = applicationFixture(
			new UltimaBase({
				schemas: [otherSchema],
				plugins: [createDatabasePlugin(secondAdapter)],
			}),
		)

		try {
			await first.start()
			const foreignContext = RequestContext.anonymous({
				requestId: 'foreign-context',
				source: requestSources.internal,
			})

			first.engine.withContext(foreignContext)

			await first.engine
				.anonymous({ requestId: 'transaction-owner', source: 'internal' })
				.transaction(async () =>
					articleSchema.createOne({ data: { title: 'Transactional' } }),
				)

			expect(firstAdapter.rootRequests).toStrictEqual([])
			expect(firstAdapter.transactions).toHaveLength(1)
			expect(firstAdapter.transactions[0]?.requests).toHaveLength(1)
			await expect(
				otherSchema.findMany(undefined, { ultimabase: first }),
			).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
			runWithRequestEngine(
				first.engine.anonymous({
					requestId: 'active-first',
					source: requestSources.internal,
				}),
				() => {
					expect(() =>
						otherSchema.findMany(undefined, { ultimabase: second }),
					).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
				},
			)
			await first.dispose()
			await second.start()
			await expect(
				otherSchema.findMany(undefined, {
					context: foreignContext,
					ultimabase: second,
				}),
			).rejects.toMatchObject({
				code: 'VALIDATION_ERROR',
				internalDetails: {
					reason: 'operation-context-application-mismatch',
				},
			})

			expect(second.application.ownsSchema(articleSchema)).toBe(false)
		} finally {
			await Promise.all([first.dispose(), second.dispose()])
		}
	})

	it('cleans initialized plugins when Runtime assembly fails', async () => {
		const trace: string[] = []
		const plugin = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.ultimabase-missing-adapter',
			setup: () => {
				trace.push('setup')
			},
			hooks: {
				dispose: () => {
					trace.push('dispose')
				},
			},
		})
		const ultimabase = applicationFixture(
			new UltimaBase({
				schemas: [articleSchema],
				plugins: [plugin],
			}),
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
					plugins: [],
					// @ts-expect-error -- Runtime validation protects unknown options.
					unknown: true,
				}),
			),
		).toThrow(new TypeError('UltimaBase contains unknown option: unknown'))
		expect(() =>
			applicationFixture(
				new UltimaBase({
					schemas: [],
					plugins: [],
					validation: { timezone: '' },
				}),
			),
		).toThrow(
			new TypeError('Runtime validation timezone must be a non-empty string'),
		)
	})
})
