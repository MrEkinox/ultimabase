import {
	postgresConnectionServiceToken,
	postgresPlugin,
} from '@ultimabase/postgres'
import {
	bigintField,
	binaryField,
	booleanField,
	databaseAdapterServiceToken,
	type DatabaseTransactionAdapter,
	dateField,
	dateTimeField,
	decimalField,
	Schema,
	enumField,
	floatField,
	intField,
	jsonField,
	normalizeUpdateExpression,
	objectField,
	Query,
	requestSources,
	runWithRequestEngine,
	stringField,
	timeField,
	uuidField,
} from '@ultimabase/core'
import { UltimaBase } from '@ultimabase/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from './postgres-worker-fixture.js'

const PostSchema = Schema.define({
	className: 'RuntimePost',
	fields: {
		attachment: binaryField(),
		calendarDay: dateField(),
		eventAt: dateTimeField(),
		exactAmount: decimalField({ validation: { precision: 12, scale: 2 } }),
		externalId: uuidField({ validation: { version: 4 } }),
		hugeCount: bigintField(),
		labels: stringField({ list: true }),
		metadata: jsonField(),
		profile: objectField({
			fields: {
				displayName: stringField({ validation: { required: true } }),
				level: intField(),
			},
		}),
		published: booleanField({ default: false }),
		rating: floatField(),
		status: enumField({ values: ['draft', 'published'] }),
		title: stringField({ validation: { required: true } }),
		views: intField({ default: 0 }),
		wakeAt: timeField(),
	},
})

const HookAuditSchema = Schema.define({
	className: 'RuntimeHookAudit',
	fields: {
		action: stringField({ validation: { required: true } }),
	},
})

const hookRollbackError = new Error('rollback HookContext nested write')
const HookPostSchema = Schema.define({
	className: 'RuntimeHookPost',
	fields: {
		title: stringField({ validation: { required: true } }),
	},
	hooks: {
		beforeCreate: async ({ operation }) => {
			if (operation.kind !== 'create-one') {
				return operation
			}

			await HookAuditSchema.query().create({
				action: `create:${operation.input.title}`,
			})

			if (operation.input.title === 'rollback') {
				throw hookRollbackError
			}

			return operation
		},
	},
})

const createInstant = '2026-08-01T08:00:00.000Z'
const updateInstant = '2026-08-01T09:30:00.000Z'
const uuidV7Pattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const allFieldValues = {
	attachment: Uint8Array.from([0, 127, 255]),
	calendarDay: '2026-08-01',
	eventAt: '2026-08-01T10:15:30.123Z',
	exactAmount: '123456.78',
	externalId: '550e8400-e29b-41d4-a716-446655440000',
	hugeCount: 9_007_199_254_740_993n,
	labels: ['typed', 'postgres'],
	metadata: { nested: { verified: true }, priority: 2 },
	profile: { displayName: 'Ada', level: 7 },
	rating: 4.75,
	status: 'draft',
	title: 'First real E2E',
	wakeAt: '08:30:00.456',
} as const

// These side-effect-free values also exercise packed constructor and static Query declarations.
const packedDraft = new PostSchema({ title: 'Packed draft' })
const packedQuery = PostSchema.query().select('id', 'title')
const packedNonAtomicCreate = () =>
	PostSchema.query().createMany([{ title: 'Packed bulk draft' }], {
		atomic: false,
	})
void packedDraft
void packedQuery
void packedNonAtomicCreate

let fixture: PostgresWorkerFixture | undefined

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined) {
		throw new TypeError('PostgreSQL worker fixture has not started')
	}

	return fixture
}

/** Proves that a competing preparation remains blocked by the retained row lock. */
const expectPreparationPending = async (
	preparation: Promise<unknown>,
): Promise<void> => {
	let timer: ReturnType<typeof setTimeout> | undefined
	const state = await Promise.race([
		preparation.then(
			() => 'settled' as const,
			() => 'settled' as const,
		),
		new Promise<'pending'>((resolve) => {
			timer = setTimeout(() => {
				resolve('pending')
			}, 50)
		}),
	])

	if (timer !== undefined) clearTimeout(timer)
	expect(state).toBe('pending')
}

// The global Testcontainer is shared, but this file owns one reset worker namespace.
beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})

describe('Runtime to PostgreSQL', { concurrent: false }, () => {
	it('keeps HookContext nested writes in the primary PostgreSQL transaction', async () => {
		const ultimabase = new UltimaBase({
			schemas: [HookPostSchema, HookAuditSchema],
			plugins: [
				postgresPlugin({
					schemaPolicy: 'override',
					url: getFixture().connectionUri,
				}),
			],
			validation: {
				clock: () => new Date(createInstant),
				timezone: 'UTC',
			},
		})

		await ultimabase.start()

		try {
			const committed = await HookPostSchema.query().create(
				{ title: 'commit' },
				{ ultimabase },
			)
			const audits = await HookAuditSchema.query()
				.select('action')
				.find({ ultimabase })

			expect(committed).toBeInstanceOf(HookPostSchema)
			expect(committed.toJSON()).toMatchObject({ title: 'commit' })
			expect(audits.every((audit) => audit instanceof HookAuditSchema)).toBe(
				true,
			)
			expect(audits.map((audit) => audit.toJSON())).toStrictEqual([
				{ action: 'create:commit' },
			])

			await expect(
				HookPostSchema.query().create({ title: 'rollback' }, { ultimabase }),
			).rejects.toBe(hookRollbackError)
			await expect(
				HookPostSchema.query()
					.equalTo('title', 'rollback')
					.exists({ ultimabase }),
			).resolves.toBe(false)
			await expect(
				HookAuditSchema.query()
					.equalTo('action', 'create:rollback')
					.exists({ ultimabase }),
			).resolves.toBe(false)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('executes the complete public singular CRUD flow against live rows', async () => {
		const instants = [createInstant, updateInstant]
		const clock = (): Date => {
			const instant = instants.shift()

			if (instant === undefined) {
				throw new TypeError('Runtime E2E clock received an unexpected mutation')
			}

			return new Date(instant)
		}
		const ultimabase = new UltimaBase({
			schemas: [PostSchema],
			plugins: [
				postgresPlugin({
					schemaPolicy: 'override',
					url: getFixture().connectionUri,
				}),
			],
			validation: { clock, timezone: 'UTC' },
		})
		await ultimabase.start()
		const connection = ultimabase.application.getService(
			postgresConnectionServiceToken,
		)

		try {
			// One live row exercises every built-in field kind across the public boundary.
			const created = await PostSchema.query().create(allFieldValues, {
				ultimabase,
			})

			expect(created).toBeInstanceOf(PostSchema)
			expect(created).toMatchObject({
				...allFieldValues,
				createdAt: createInstant,
				published: false,
				updatedAt: createInstant,
				views: 0,
			})
			expect(created.id).toMatch(uuidV7Pattern)
			expect(created.attachment).not.toBe(allFieldValues.attachment)

			const found = await PostSchema.query()
				.equalTo('published', false)
				.greaterThanOrEqualTo('views', 0)
				.select('id', 'title')
				.find({ ultimabase })

			expect(found.every((post) => post instanceof PostSchema)).toBe(true)
			expect(found.map((post) => post.toJSON())).toStrictEqual([
				{ id: created.id, title: 'First real E2E' },
			])

			const updated = await PostSchema.query()
				.equalTo('id', created.id)
				.select('id', 'published', 'title', 'updatedAt', 'views')
				.update(
					{
						increment: { views: 2 },
						set: { published: true, title: 'Persisted E2E' },
					},
					{ ultimabase },
				)

			expect(updated).toBeInstanceOf(PostSchema)
			expect(updated?.toJSON()).toStrictEqual({
				id: created.id,
				published: true,
				title: 'Persisted E2E',
				updatedAt: updateInstant,
				views: 2,
			})

			const deleted = await PostSchema.query()
				.equalTo('id', created.id)
				.select('id', 'title')
				.delete({ ultimabase })

			expect(deleted).toBeInstanceOf(PostSchema)
			expect(deleted?.toJSON()).toStrictEqual({
				id: created.id,
				title: 'Persisted E2E',
			})
			await expect(
				PostSchema.query().equalTo('id', created.id).find({ ultimabase }),
			).resolves.toStrictEqual([])
			await expect(PostSchema.query().count({ ultimabase })).resolves.toBe(0)
			await expect(PostSchema.query().exists({ ultimabase })).resolves.toBe(
				false,
			)
		} finally {
			await ultimabase.dispose()
		}

		expect(connection.state).toBe('closed')
	})

	it('commits and rolls back explicit Runtime transactions on one PostgreSQL client', async () => {
		const instants = [createInstant, updateInstant]
		const ultimabase = new UltimaBase({
			schemas: [PostSchema],
			plugins: [
				postgresPlugin({
					schemaPolicy: 'override',
					url: getFixture().connectionUri,
				}),
			],
			validation: {
				clock: () => {
					const instant = instants.shift()

					if (instant === undefined) {
						throw new TypeError(
							'Runtime transaction E2E clock received an unexpected mutation',
						)
					}

					return new Date(instant)
				},
				timezone: 'UTC',
			},
		})
		await ultimabase.start()
		const request = ultimabase.engine.anonymous({
			requestId: 'postgres-transaction-e2e',
			source: requestSources.internal,
		})
		const rollbackError = new Error('rollback transaction fixture')

		try {
			const committed = await request.transaction(() =>
				PostSchema.query().create({ title: 'Committed transaction' }),
			)
			expect(committed).toBeInstanceOf(PostSchema)

			const found = await runWithRequestEngine(request, () =>
				PostSchema.query()
					.equalTo('id', committed.id)
					.select('id', 'title')
					.first(),
			)

			expect(found).toBeInstanceOf(PostSchema)
			expect(found?.toJSON()).toStrictEqual({
				id: committed.id,
				title: 'Committed transaction',
			})

			await expect(
				request.transaction(async () => {
					await PostSchema.query().create({
						title: 'Rolled back transaction',
					})
					throw rollbackError
				}),
			).rejects.toBe(rollbackError)
			await expect(
				runWithRequestEngine(request, () =>
					PostSchema.query()
						.equalTo('title', 'Rolled back transaction')
						.exists(),
				),
			).resolves.toBe(false)

			await runWithRequestEngine(request, () =>
				PostSchema.query().equalTo('id', committed.id).deleteOne(),
			)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('keeps prepared update and delete targets stable across concurrent transactions', async () => {
		const ultimabase = new UltimaBase({
			schemas: [PostSchema],
			plugins: [
				postgresPlugin({
					schemaPolicy: 'override',
					url: getFixture().connectionUri,
				}),
			],
			validation: { clock: () => new Date(createInstant), timezone: 'UTC' },
		})
		await ultimabase.start()
		const adapter = ultimabase.application.getService(
			databaseAdapterServiceToken,
		)
		const transactions: DatabaseTransactionAdapter[] = []

		try {
			const updatedTarget = await PostSchema.query().create(
				{ title: 'Original update target' },
				{ ultimabase },
			)
			const updateQuery = new Query(PostSchema)
				.equalTo('id', updatedTarget.id)
				.select('id', 'title')
			const firstUpdate = normalizeUpdateExpression(PostSchema, {
				set: { title: 'First committed update' },
			})
			const secondUpdate = normalizeUpdateExpression(PostSchema, {
				set: { title: 'Second committed update' },
			})
			const firstTransaction = await adapter.beginTransaction()
			const secondTransaction = await adapter.beginTransaction()
			transactions.push(firstTransaction, secondTransaction)
			const firstPrepared = await firstTransaction.prepare({
				constraints: [],
				operation: {
					kind: 'update-one',
					query: updateQuery.ast,
					update: firstUpdate,
				},
			})
			const secondPreparation = secondTransaction.prepare({
				constraints: [],
				operation: {
					kind: 'update-one',
					query: updateQuery.ast,
					update: secondUpdate,
				},
			})

			await expectPreparationPending(secondPreparation)
			await firstPrepared.execute()
			await firstTransaction.commit()

			const secondPrepared = await secondPreparation
			const secondOutcome = await secondPrepared.execute()
			await secondTransaction.commit()
			expect(secondOutcome.materializations).toMatchObject([
				{
					current: { title: 'Second committed update' },
					kind: 'update',
					previous: { title: 'First committed update' },
				},
			])

			const deletedTarget = await PostSchema.query().create(
				{ title: 'Stable delete target' },
				{ ultimabase },
			)
			const deleteQuery = new Query(PostSchema)
				.equalTo('id', deletedTarget.id)
				.select('id', 'title')
			const deleteTransaction = await adapter.beginTransaction()
			const competingTransaction = await adapter.beginTransaction()
			transactions.push(deleteTransaction, competingTransaction)
			const preparedDelete = await deleteTransaction.prepare({
				constraints: [],
				operation: { kind: 'delete-one', query: deleteQuery.ast },
			})
			const competingPreparation = competingTransaction.prepare({
				constraints: [],
				operation: {
					kind: 'update-one',
					query: deleteQuery.ast,
					update: firstUpdate,
				},
			})

			await expectPreparationPending(competingPreparation)
			await preparedDelete.execute()
			await deleteTransaction.commit()

			const missingTarget = await competingPreparation
			await expect(missingTarget.execute()).resolves.toStrictEqual({
				materializations: [],
				result: null,
			})
			await competingTransaction.commit()
		} finally {
			// Active transactions must release their borrowed clients on failed assertions.
			await Promise.allSettled(
				transactions.map((transaction) => transaction.rollback()),
			)
			await ultimabase.dispose()
		}
	})
})
