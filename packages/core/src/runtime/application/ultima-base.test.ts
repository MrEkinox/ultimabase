import { definePlugin } from '../../foundation.js'
import { Schema, stringField } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import type { RequestContext } from '../context/request-context.js'
import {
	databaseAdapterServiceToken,
	type DatabaseAdapter,
} from '../database/contracts.js'
import { beforeOperation } from '../hooks/definitions.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { UltimaBase } from './ultima-base.js'

const articleSchema = new Schema({
	className: 'UltimaBaseArticle',
	fields: {
		title: stringField({ validation: { required: true } }),
	},
})

const createDatabasePlugin = (
	adapter: DatabaseAdapter,
	options: {
		readonly onContext?: (context: RequestContext) => void
		readonly trace?: string[]
	} = {},
) =>
	definePlugin({
		name: 'fixture.ultimabase-database',
		slot: 'database-adapter',
		setup: ({ registries, services }) => {
			options.trace?.push('setup')
			services.provide(databaseAdapterServiceToken, adapter)

			if (options.onContext !== undefined) {
				registries.hooks.register(
					'fixture.ultimabase-context',
					beforeOperation({
						schema: articleSchema,
						operations: ['find'],
						handler: ({ context, operation }) => {
							options.onContext?.(context)

							return { operation }
						},
					}),
				)
			}
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
		const ultimabase = new UltimaBase({
			schemas: [articleSchema],
			plugins: [
				createDatabasePlugin(adapter, {
					onContext: (context) => {
						observedContext = context
					},
					trace,
				}),
			],
			validation,
		})
		validation.timezone = ''

		expect(ultimabase.state).toBe('idle')
		expect(trace).toStrictEqual([])
		expect(Object.isFrozen(ultimabase)).toBe(true)
		expect(() => ultimabase.engine).toThrow(
			new TypeError('UltimaBase must be started before accessing its engine'),
		)
		expect(() => ultimabase.query(articleSchema)).toThrow(
			new TypeError('UltimaBase must be started before accessing its engine'),
		)

		const start = ultimabase.start()

		expect(ultimabase.start()).toBe(start)
		await start
		expect(ultimabase.state).toBe('started')
		expect(trace).toStrictEqual(['setup', 'connect'])

		const result = await ultimabase.query(articleSchema).find()

		expect(result).toStrictEqual(rows)
		expect(result).not.toBe(rows)
		expect(Object.isFrozen(result)).toBe(true)
		expect(observedContext?.access).toStrictEqual({ mode: 'anonymous' })
		expect(observedContext?.source).toBe('internal')
		expect(observedContext?.requestId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
		)

		const escapedQuery = ultimabase.query(articleSchema)

		await ultimabase.stop()
		expect(ultimabase.state).toBe('stopped')
		expect(trace).toStrictEqual(['setup', 'connect', 'stop'])
		expect(() => escapedQuery.find()).toThrow(
			new TypeError(
				'Framework engine cannot be used while application is stopped',
			),
		)
		expect(() => ultimabase.start()).toThrow(
			new TypeError('Cannot start UltimaBase while application is stopped'),
		)

		await ultimabase[Symbol.asyncDispose]()
		await ultimabase.dispose()
		expect(trace).toStrictEqual(['setup', 'connect', 'stop', 'dispose'])
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
		const otherSchema = new Schema({
			className: 'OtherUltimaBaseArticle',
			fields: { title: stringField() },
		})
		const secondAdapter = new RecordingDatabaseAdapter([], [])
		const first = new UltimaBase({
			schemas: [articleSchema],
			plugins: [createDatabasePlugin(firstAdapter)],
		})
		const second = new UltimaBase({
			schemas: [otherSchema],
			plugins: [createDatabasePlugin(secondAdapter)],
		})

		try {
			await Promise.all([first.start(), second.start()])

			await first.engine
				.anonymous({ requestId: 'transaction-owner', source: 'internal' })
				.transaction(async () =>
					first.query(articleSchema).create({ title: 'Transactional' }),
				)

			expect(firstAdapter.rootRequests).toStrictEqual([])
			expect(firstAdapter.transactions).toHaveLength(1)
			expect(firstAdapter.transactions[0]?.requests).toHaveLength(1)
			expect(() =>
				// @ts-expect-error -- Runtime ownership rejects another facade's schema.
				first.query(otherSchema),
			).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }))
			expect(second.application.ownsSchema(articleSchema)).toBe(false)
		} finally {
			await Promise.all([first.dispose(), second.dispose()])
		}
	})

	it('cleans initialized plugins when Runtime assembly fails', async () => {
		const trace: string[] = []
		const plugin = definePlugin({
			name: 'fixture.ultimabase-missing-adapter',
			setup: () => {
				trace.push('setup')
			},
			hooks: {
				dispose: () => {
					trace.push('dispose')
				},
			},
		})
		const ultimabase = new UltimaBase({
			schemas: [articleSchema],
			plugins: [plugin],
		})

		await expect(ultimabase.start()).rejects.toMatchObject({
			code: 'SERVICE_NOT_FOUND',
		})
		expect(ultimabase.state).toBe('disposed')
		expect(trace).toStrictEqual(['setup', 'dispose'])
	})

	it('rejects malformed JavaScript options before plugin setup', () => {
		expect(() => {
			// @ts-expect-error -- Runtime validation protects non-object callers.
			new UltimaBase(null)
		}).toThrow(new TypeError('UltimaBase options must be a plain object'))
		expect(
			() =>
				new UltimaBase({
					schemas: [],
					plugins: [],
					// @ts-expect-error -- Runtime validation protects unknown options.
					unknown: true,
				}),
		).toThrow(new TypeError('UltimaBase contains unknown option: unknown'))
		expect(
			() =>
				new UltimaBase({
					schemas: [],
					plugins: [],
					validation: { timezone: '' },
				}),
		).toThrow(
			new TypeError('Runtime validation timezone must be a non-empty string'),
		)
	})
})
