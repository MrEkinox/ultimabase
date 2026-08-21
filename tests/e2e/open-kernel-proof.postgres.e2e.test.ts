import { Schema, UltimaBase, requestSources } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import type { PostgresPluginExports } from '@ultimabase/postgres-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createSoftDeletePostgresPlugin,
	createValuePostgresPlugin,
} from './fixtures/open-kernel-postgres.js'
import { createSoftDeletePlugin } from './fixtures/open-kernel-soft-delete.js'
import { createValuePlugin } from './fixtures/open-kernel-value.js'
import {
	createWorkflowPlugin,
	type WorkflowCommittedPayload,
} from './fixtures/open-kernel-workflow.js'
import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

let fixture: PostgresWorkerFixture | undefined

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) {
		throw new TypeError('Open-kernel PostgreSQL fixture has not started')
	}
	return fixture
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'open_kernel' })
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})

describe('open-kernel PostgreSQL proof', { concurrent: false }, () => {
	it('runs workflow, logical value, and soft-delete plugins through public bridges', async () => {
		const committed: WorkflowCommittedPayload[] = []
		const deleteTrace: string[] = []
		let rejectDelete = false
		const WorkflowPost = Schema.define({
			className: 'OpenKernelPostgresWorkflowPost',
			fields: (field) => ({ title: field.string() }),
		})
		const LedgerEntry = Schema.define({
			className: 'OpenKernelLedgerEntry',
			postgres: { table: 'open_kernel_ledger_entries' },
			fields: (field) => ({ label: field.string() }),
		})
		const SoftPost = Schema.define({
			className: 'OpenKernelSoftPost',
			postgres: { table: 'open_kernel_soft_posts' },
			fields: (field) => ({
				title: field.string({ validation: { required: true } }),
			}),
			hooks: {
				afterOperation: {
					delete: ({ originalItem }) => {
						deleteTrace.push(`delete:${originalItem.id}`)
						if (rejectDelete) throw new Error('reject tombstone')
					},
					update: () => {
						deleteTrace.push('update')
					},
				},
			},
		})
		const workflow = createWorkflowPlugin({
			instanceId: 'postgres',
			onCommitted: (payload) => committed.push(payload),
			stableSchema: WorkflowPost,
		})
		const value = createValuePlugin({
			instanceId: 'primary',
			target: LedgerEntry,
		})
		const valuePostgres = createValuePostgresPlugin({
			instanceId: 'primary',
			table: 'open_kernel_ledger_entries',
			version: '1.0.0',
		})
		const softDelete = createSoftDeletePlugin({
			instanceId: 'primary',
			target: SoftPost,
		})
		const softDeletePostgres = createSoftDeletePostgresPlugin({
			instanceId: 'primary',
			schema: SoftPost,
			table: 'open_kernel_soft_posts',
		})
		const ultimabase = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [
				postgresPlugin({ pool: getFixture().pool, schemaPolicy: 'override' }),
				hooksPlugin(),
				workflow.plugin,
				value,
				valuePostgres,
				softDeletePostgres,
				softDelete,
			],
			schemas: [WorkflowPost, LedgerEntry, SoftPost],
		})
		await ultimabase.start()

		try {
			const amount = { scale: 2, units: '12345' } as const
			const entry = await LedgerEntry.createOne(
				{ data: { amount, label: 'invoice' } },
				{ ultimabase },
			)
			expect(entry.toJSON()).toMatchObject({ amount, label: 'invoice' })
			await expect(
				LedgerEntry.createOne(
					{ data: { amount: { scale: -1, units: 'broken' }, label: 'bad' } },
					{ ultimabase },
				),
			).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
			const filtered = await LedgerEntry.findMany(
				{ where: { amount: { eq: amount } } } as never,
				{ ultimabase },
			)
			expect(filtered.map(({ id }) => id)).toStrictEqual([entry.id])
			const stored = await getFixture().pool.query<{
				readonly amount: unknown
				readonly amount_sort_key: null
			}>(
				'SELECT amount, amount_sort_key FROM open_kernel_ledger_entries WHERE id = $1',
				[entry.id],
			)
			expect(stored.rows).toStrictEqual([{ amount, amount_sort_key: null }])
			const postgres = ultimabase.application.getPlugin(
				'@ultimabase/postgres-plugin',
			) as PostgresPluginExports
			const physical = postgres.adapterMetadata.physicalSchema.find(
				({ contributionId }) => contributionId === 'decimal-sort-key',
			)
			expect(physical).toMatchObject({
				contributionId: 'decimal-sort-key',
				instanceId: 'primary',
				pluginId: 'fixture.open-kernel-value-postgres',
				protocolVersion: 1,
			})

			const audit = await workflow.DynamicAudit.createOne(
				{ data: { action: 'publish' } },
				{ ultimabase },
			)
			expect(committed).toStrictEqual([
				{ action: 'publish', auditId: audit.id },
			])
			const request = ultimabase.engine.anonymous({
				requestId: 'open-kernel-event-rollback',
				source: requestSources.internal,
			})
			await expect(
				request.transaction(async () => {
					await workflow.DynamicAudit.createOne({
						data: { action: 'rollback' },
					})
					throw new Error('rollback event')
				}),
			).rejects.toThrow('rollback event')
			expect(committed).toHaveLength(1)
			expect(
				await workflow.DynamicAudit.count(
					{ where: { action: { eq: 'rollback' } } },
					{ ultimabase },
				),
			).toBe(0)

			const created = await SoftPost.createOne(
				{ data: { title: 'Tombstone me' } },
				{ ultimabase },
			)
			await SoftPost.deleteOne({ id: created.id }, { ultimabase })
			expect(
				await SoftPost.findOne(
					{ where: { id: { eq: created.id } } },
					{ ultimabase },
				),
			).toBeNull()
			expect(deleteTrace).toStrictEqual([`delete:${created.id}`])
			const restored = await ultimabase
				.schema(SoftPost)
				.for(created)
				.command('restore')
				.execute({})
			expect(restored).toStrictEqual({ changed: true })
			expect(
				await SoftPost.findOne(
					{ where: { id: { eq: created.id } } },
					{ ultimabase },
				),
			).not.toBeNull()
			expect(deleteTrace).not.toContain('update')

			rejectDelete = true
			await expect(
				SoftPost.deleteOne({ id: created.id }, { ultimabase }),
			).rejects.toThrow('reject tombstone')
			rejectDelete = false
			expect(
				await SoftPost.findOne(
					{ where: { id: { eq: created.id } } },
					{ ultimabase },
				),
			).not.toBeNull()
			await SoftPost.deleteOne({ id: created.id }, { ultimabase })
			await expect(
				ultimabase.schema(SoftPost).for(created).command('purge').execute({}),
			).resolves.toStrictEqual({ changed: true })
			const remaining = await getFixture().pool.query<{
				readonly count: string
			}>(
				'SELECT count(*)::text AS count FROM open_kernel_soft_posts WHERE id = $1',
				[created.id],
			)
			expect(remaining.rows).toStrictEqual([{ count: '0' }])
		} finally {
			await ultimabase.dispose()
		}
	}, 30_000)
})
