import { postgresPlugin } from '@ultimabase/postgres-plugin'
import {
	afterOperation,
	beforeOperation,
	definePlugin,
	normalizeUpdateExpression,
	persistencePlanRewriter,
	providePersistencePlanRewriter,
	provideRuntimeInterceptor,
	rewriteDeletePersistencePlan,
	Schema,
	UltimaBase,
} from '@ultimabase/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

const SoftDeletePost = Schema.define({
	className: 'PersistenceRewritePost',
	fields: (field) => ({
		title: field.string({ validation: { required: true } }),
	}),
})

let fixture: PostgresWorkerFixture | undefined

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) {
		throw new TypeError('PostgreSQL persistence fixture has not started')
	}

	return fixture
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})

describe(
	'rewritable PostgreSQL persistence plans',
	{ concurrent: false },
	() => {
		it('keeps delete hooks logical and rolls back an itemized tombstone batch', async () => {
			const trace: string[] = []
			let failBatch = false
			let batchBeforeCount = 0
			const rewriter = persistencePlanRewriter({
				operations: ['delete-one'],
				schema: SoftDeletePost,
				rewrite: ({ logicalOperation, plan }) => {
					trace.push(`rewrite:${logicalOperation.kind}`)
					return rewriteDeletePersistencePlan(
						plan,
						normalizeUpdateExpression(SoftDeletePost, { title: 'TOMBSTONED' }),
					)
				},
			})
			const softDeleteFixture = definePlugin({
				core: '^0.0.0',
				pluginId: 'fixture.postgres-persistence-rewrite',
				version: '0.0.0',
				privileges: [
					{
						name: 'persistence:rewrite',
						reason: 'Exercises physical delete rewriting.',
					},
					{
						name: 'runtime:intercept',
						reason: 'Observes preserved logical delete semantics.',
					},
				],
				capabilities: {
					provides: [
						providePersistencePlanRewriter({
							contributionId: 'soft-delete',
							create: () => ({ value: rewriter }),
						}),
						provideRuntimeInterceptor({
							contributionId: 'delete-before',
							create: () => ({
								value: beforeOperation({
									operations: ['delete-one'],
									schema: SoftDeletePost,
									handler: ({ operation }) => {
										trace.push(`before:${operation.kind}`)
										if (failBatch && ++batchBeforeCount === 2) {
											throw new Error('fixture batch failure')
										}
									},
								}),
							}),
						}),
						provideRuntimeInterceptor({
							contributionId: 'delete-after',
							create: () => ({
								value: afterOperation({
									operations: ['delete-one'],
									schema: SoftDeletePost,
									handler: ({ operation, result }) => {
										trace.push(
											`after:${operation.kind}:${String(result?.title)}`,
										)
										return { result }
									},
								}),
							}),
						}),
					],
				},
			})
			const ultimabase = new UltimaBase({
				schemas: [SoftDeletePost],
				plugins: [
					postgresPlugin({
						schemaPolicy: 'override',
						url: getFixture().connectionUri,
					}),
					softDeleteFixture,
				],
			})
			await ultimabase.start()

			try {
				const single = await SoftDeletePost.createOne(
					{ data: { title: 'Single soft delete' } },
					{ ultimabase },
				)
				const deleted = await SoftDeletePost.deleteOne(
					{ id: single.id, select: { id: true, title: true } },
					{ ultimabase },
				)

				expect(deleted?.toJSON()).toStrictEqual({
					id: single.id,
					title: 'Single soft delete',
				})
				const stored = await SoftDeletePost.findOne(
					{
						select: { id: true, title: true },
						where: { id: { eq: single.id } },
					},
					{ ultimabase },
				)
				expect(stored?.toJSON()).toStrictEqual({
					id: single.id,
					title: 'TOMBSTONED',
				})
				expect(trace).toStrictEqual([
					'before:delete-one',
					'rewrite:delete-one',
					'after:delete-one:Single soft delete',
				])

				const first = await SoftDeletePost.createOne(
					{ data: { title: 'First batch' } },
					{ ultimabase },
				)
				const second = await SoftDeletePost.createOne(
					{ data: { title: 'Second batch' } },
					{ ultimabase },
				)
				trace.length = 0
				failBatch = true
				batchBeforeCount = 0
				await expect(
					SoftDeletePost.deleteMany(
						{ where: [{ id: { eq: first.id } }, { id: { eq: second.id } }] },
						{ ultimabase },
					),
				).rejects.toThrow('fixture batch failure')
				expect(trace).toStrictEqual([
					'before:delete-one',
					'rewrite:delete-one',
					'after:delete-one:undefined',
					'before:delete-one',
				])
				const [firstAfter, secondAfter] = await Promise.all([
					SoftDeletePost.findOne(
						{ where: { id: { eq: first.id } } },
						{ ultimabase },
					),
					SoftDeletePost.findOne(
						{ where: { id: { eq: second.id } } },
						{ ultimabase },
					),
				])
				expect(firstAfter?.title).toBe('First batch')
				expect(secondAfter?.title).toBe('Second batch')
			} finally {
				await ultimabase.dispose()
			}
		})
	},
)
