import { definePlugin } from '../../foundation.js'
import { Schema, booleanField, stringField } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { databaseAdapterServiceToken } from '../database/contracts.js'
import { afterOperation, beforeOperation } from '../hooks/definitions.js'
import { UltimaBase } from '../application/ultima-base.js'

const securedArticle = Schema.define({
	className: 'AccessPipelineArticle',
	access: {
		read: {
			allow: true,
			where: ({ where }) => where.eq('published', true),
		},
		update: {
			allow: true,
			where: ({ where }) => where.eq('published', true),
			item: ({ originalItem, item }) =>
				item.title === 'Changed' && originalItem.published === true,
		},
	},
	fields: {
		published: booleanField(),
		secret: stringField({
			access: { read: { orderBy: false, output: false, where: false } },
		}),
		title: stringField({ validation: { required: true } }),
	},
})

const createAdapterPlugin = (
	adapter: RecordingDatabaseAdapter,
	observedBusinessFilters: unknown[],
	observedHookResults: unknown[],
) =>
	definePlugin({
		name: 'fixture.native-access-database',
		slot: 'database-adapter',
		setup: ({ registries, services }) => {
			services.provide(databaseAdapterServiceToken, adapter)
			registries.hooks.register(
				'fixture.observe-business-query',
				beforeOperation({
					handler: ({ operation }) => {
						if ('query' in operation) {
							observedBusinessFilters.push(operation.query.where)
						}

						return undefined
					},
					operations: ['find-many'],
					schema: securedArticle,
				}),
			)
			registries.hooks.register(
				'fixture.observe-projected-result',
				afterOperation({
					handler: ({ result }) => {
						observedHookResults.push(result)

						return { result }
					},
					operations: ['find-many'],
					schema: securedArticle,
				}),
			)
		},
	})

describe('native Access pipeline integration', () => {
	it('keeps row filters private and reapplies field projection after business hooks', async () => {
		const trace: string[] = []
		const adapter = new RecordingDatabaseAdapter(
			[
				{
					status: 'fulfilled',
					value: [
						{
							createdAt: '2026-08-03T00:00:00.000Z',
							id: '0198a43e-2431-7000-8000-000000000001',
							published: true,
							secret: 'adapter-secret',
							title: 'Public',
							updatedAt: '2026-08-03T00:00:00.000Z',
						},
					],
				},
			],
			trace,
		)
		const observedBusinessFilters: unknown[] = []
		const observedHookResults: unknown[] = []
		const ultimabase = new UltimaBase({
			plugins: [
				createAdapterPlugin(
					adapter,
					observedBusinessFilters,
					observedHookResults,
				),
			],
			schemas: [securedArticle],
		})

		try {
			await ultimabase.start()
			const result = await securedArticle.findMany(
				{ where: { title: { eq: 'Public' } } },
				{ ultimabase },
			)

			expect(observedBusinessFilters).toHaveLength(1)
			expect(observedBusinessFilters[0]).toMatchObject({
				expression: { field: 'title', kind: 'equal', value: 'Public' },
			})
			expect(observedHookResults).toStrictEqual([
				[
					{
						createdAt: '2026-08-03T00:00:00.000Z',
						id: '0198a43e-2431-7000-8000-000000000001',
						published: true,
						title: 'Public',
						updatedAt: '2026-08-03T00:00:00.000Z',
					},
				],
			])
			expect(adapter.rootRequests[0]?.rowFilter).toMatchObject({
				field: 'published',
				kind: 'equal',
				value: true,
			})
			expect(result).toHaveLength(1)
			expect(result[0]).toMatchObject({
				createdAt: '2026-08-03T00:00:00.000Z',
				id: '0198a43e-2431-7000-8000-000000000001',
				published: true,
				title: 'Public',
				updatedAt: '2026-08-03T00:00:00.000Z',
			})
			expect(result[0]).not.toHaveProperty('secret')
		} finally {
			await ultimabase.dispose()
		}
	})

	it('rolls back a singular mutation denied against its prepared target', async () => {
		const trace: string[] = []
		const adapter = new RecordingDatabaseAdapter(
			[
				{
					status: 'fulfilled',
					target: {
						createdAt: '2026-08-03T00:00:00.000Z',
						id: '0198a43e-2431-7000-8000-000000000002',
						published: false,
						title: 'Private',
						updatedAt: '2026-08-03T00:00:00.000Z',
					},
					value: null,
				},
			],
			trace,
		)
		const ultimabase = new UltimaBase({
			plugins: [createAdapterPlugin(adapter, [], [])],
			schemas: [securedArticle],
		})

		try {
			await ultimabase.start()
			await expect(
				securedArticle.updateOne(
					{
						where: (where) =>
							where.eq('id', '0198a43e-2431-7000-8000-000000000002'),
						data: { title: 'Changed' },
					},
					{ ultimabase },
				),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			expect(trace).toStrictEqual([
				'adapter:begin',
				'prepare:update-one',
				'adapter:rollback',
			])
			expect(adapter.transactions[0]?.requests[0]?.rowFilter).toMatchObject({
				field: 'published',
				kind: 'equal',
				value: true,
			})
		} finally {
			await ultimabase.dispose()
		}
	})
})
