import { postgresPlugin } from '@ultimabase/postgres-plugin'
import {
	getOperationSchema,
	plugin,
	normalizeUpdateExpression,
	persistencePlanRewriter,
	providePersistencePlanRewriter,
	provideRuntimeBehavior,
	type RuntimeLogicalOperationAst,
	rewriteDeletePersistencePlan,
	UltimaBase,
} from '@ultimabase/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

const SoftDeletePost = UltimaBase.Schema.define({
	className: 'PersistenceRewritePost',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})

/** Limits the observer to logical single deletes of the soft-deleted schema. */
const isSoftDeleteOne = (operation: RuntimeLogicalOperationAst): boolean =>
	operation.kind === 'delete-one' &&
	getOperationSchema(operation) === SoftDeletePost

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
			const softDeleteFixture = plugin({
				core: '^0.0.0',
				id: 'fixture.postgres-persistence-rewrite',
				version: '0.0.0',
				permissions: {
					'persistence:rewrite': 'Exercises physical delete rewriting.',
					'runtime:intercept': 'Observes preserved logical delete semantics.',
				},
				contributions: [
					providePersistencePlanRewriter({
						contributionId: 'soft-delete',
						create: () => ({ value: rewriter }),
					}),
					provideRuntimeBehavior({
						contributionId: 'delete-observer',
						create: () => ({
							value: {
								beforeOperation: ({ operation }) => {
									if (!isSoftDeleteOne(operation)) return
									trace.push(`before:${operation.kind}`)
									if (failBatch && ++batchBeforeCount === 2) {
										throw new Error('fixture batch failure')
									}
								},
								transformResult: ({ operation, result }) => {
									if (isSoftDeleteOne(operation)) {
										const value: unknown = result
										const title: unknown =
											typeof value === 'object' && value !== null
												? Reflect.get(value, 'title')
												: undefined
										trace.push(`after:${operation.kind}:${String(title)}`)
									}
									return result
								},
							},
						}),
					}),
				],
			})
			const ultimabase = new (UltimaBase.use(
				postgresPlugin({
					schemaPolicy: 'override',
					url: getFixture().connectionUri,
				}),
				softDeleteFixture,
			))({ schemas: [SoftDeletePost] })
			await ultimabase.start()

			try {
				const single = await SoftDeletePost.createOne({
					data: { title: 'Single soft delete' },
				})
				const deleted = await SoftDeletePost.deleteOne({
					id: single.id,
					select: { id: true, title: true },
				})

				expect(deleted?.toJSON()).toStrictEqual({
					id: single.id,
					title: 'Single soft delete',
				})
				const stored = await SoftDeletePost.findOne({
					select: { id: true, title: true },
					where: { id: { eq: single.id } },
				})
				expect(stored?.toJSON()).toStrictEqual({
					id: single.id,
					title: 'TOMBSTONED',
				})
				expect(trace).toStrictEqual([
					'before:delete-one',
					'rewrite:delete-one',
					'after:delete-one:Single soft delete',
				])

				const first = await SoftDeletePost.createOne({
					data: { title: 'First batch' },
				})
				const second = await SoftDeletePost.createOne({
					data: { title: 'Second batch' },
				})
				trace.length = 0
				failBatch = true
				batchBeforeCount = 0
				await expect(
					SoftDeletePost.deleteMany({
						where: [{ id: { eq: first.id } }, { id: { eq: second.id } }],
					}),
				).rejects.toThrow('fixture batch failure')
				expect(trace).toStrictEqual([
					'before:delete-one',
					'rewrite:delete-one',
					'after:delete-one:undefined',
					'before:delete-one',
				])
				const [firstAfter, secondAfter] = await Promise.all([
					SoftDeletePost.findOne({ where: { id: { eq: first.id } } }),
					SoftDeletePost.findOne({ where: { id: { eq: second.id } } }),
				])
				expect(firstAfter?.title).toBe('First batch')
				expect(secondAfter?.title).toBe('Second batch')
			} finally {
				await ultimabase.dispose()
			}
		})
	},
)
