import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { waitForAfterCommit } from '@ultimabase/testing/plugins'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'
import { createSoftDeletePlugin } from './fixtures/open-kernel-soft-delete.js'
import { createValuePlugin } from './fixtures/open-kernel-value.js'
import {
	createWorkflowPlugin,
	type WorkflowCommittedPayload,
} from './fixtures/open-kernel-workflow.js'
import { requestSources, anonymous } from '@ultimabase/core/plugin'

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
	it('runs workflow, logical value, and soft-delete plugins through public contracts', async () => {
		const committed: WorkflowCommittedPayload[] = []
		const deleteTrace: string[] = []
		let rejectDelete = false
		const postgresDefinition = postgresPlugin({
			pool: getFixture().pool,
			schemaPolicy: 'override',
		})
		const PostgresHookApplication =
			UltimaBase.use(postgresDefinition).use(hooksPlugin())
		const WorkflowPost = PostgresHookApplication.Schema.define({
			className: 'OpenKernelPostgresWorkflowPost',
			fields: (field) => ({ title: field.string() }),
		})
		const value = createValuePlugin({
			instanceId: 'primary',
			targetClassName: 'OpenKernelLedgerEntry',
		})
		const LedgerEntry = PostgresHookApplication.use(value)
			.Schema.define({
				className: 'OpenKernelLedgerEntry',
				fields: (field) => ({
					label: field.string({
						decimalLabel: { format: 'accounting' },
					}),
				}),
			})
			.with({
				decimalLedger: { defaultScale: 2 },
				postgres: { table: 'open_kernel_ledger_entries' },
			})
		const SoftPost = PostgresHookApplication.Schema.define({
			className: 'OpenKernelSoftPost',
			fields: (field) => ({
				title: field.string({ required: true }),
			}),
		}).with({
			postgres: { table: 'open_kernel_soft_posts' },
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
		const softDelete = createSoftDeletePlugin({
			instanceId: 'primary',
			target: SoftPost,
		})
		const Application = PostgresHookApplication.use(workflow.plugin)
			.use(value)
			.use(softDelete)
		const ultimabase = new Application({
			logger: false,
			schemas: [WorkflowPost, LedgerEntry, SoftPost],
		})
		await ultimabase.start()

		try {
			const amount = { scale: 2, units: '12345' } as const
			const entry = await LedgerEntry.createOne({
				data: { amount, label: 'invoice' },
			})
			expect(entry).toMatchObject({ amount, label: 'invoice' })
			await expect(
				LedgerEntry.createOne({
					data: { amount: { scale: -1, units: 'broken' }, label: 'bad' },
				}),
			).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
			// This Runtime-only fixture has no generated registry; the companion
			// editor test verifies this exact query with generated WhereInput types.
			const filtered = await LedgerEntry.findMany({
				where: { amount: { eq: amount } },
			} as never)
			expect(filtered.map(({ id }) => id)).toStrictEqual([entry.id])
			const stored = await getFixture().pool.query<{
				readonly amount: unknown
			}>('SELECT amount FROM open_kernel_ledger_entries WHERE id = $1', [
				entry.id,
			])
			expect(stored.rows).toStrictEqual([{ amount }])

			const audit = await workflow.DynamicAudit.createOne({
				data: { action: 'publish' },
			})
			// Events reach consumers after commit, without delaying the call.
			await waitForAfterCommit()
			expect(committed).toStrictEqual([
				{ action: 'publish', auditId: audit.id },
			])
			const request = anonymous(ultimabase, {
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
			await waitForAfterCommit()
			expect(committed).toHaveLength(1)
			expect(
				await workflow.DynamicAudit.count({
					where: { action: { eq: 'rollback' } },
				}),
			).toBe(0)

			const created = await SoftPost.createOne({
				data: { title: 'Tombstone me' },
			})
			await SoftPost.deleteOne({ where: { id: created.id } })
			expect(
				await SoftPost.findOne({ where: { id: { eq: created.id } } }),
			).toBeNull()
			expect(deleteTrace).toStrictEqual([`delete:${created.id}`])
			expect(deleteTrace).not.toContain('update')
			const retained = await SoftPost.createOne({
				data: { title: 'Keep on rollback' },
			})

			rejectDelete = true
			await expect(
				SoftPost.deleteOne({ where: { id: retained.id } }),
			).rejects.toThrow('reject tombstone')
			rejectDelete = false
			expect(
				await SoftPost.findOne({ where: { id: { eq: retained.id } } }),
			).not.toBeNull()
			const remaining = await getFixture().pool.query<{
				readonly count: string
			}>(
				'SELECT count(*)::text AS count FROM open_kernel_soft_posts WHERE id = $1',
				[created.id],
			)
			expect(remaining.rows).toStrictEqual([{ count: '1' }])
		} finally {
			await ultimabase.dispose()
		}
	}, 30_000)
})
