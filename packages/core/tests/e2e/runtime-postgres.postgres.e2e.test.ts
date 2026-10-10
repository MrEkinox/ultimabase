import { postgresPlugin, postgresPluginName } from '@ultimabase/postgres-plugin'
import {
	type DatabaseTransactionAdapter,
	normalizeUpdateExpression,
	QueryBuilder,
	RequestContext,
	requestSources,
	runWithRequestEngine,
	MasterAuthority,
	UltimaBase,
} from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { describe, expect, it } from 'vitest'

import { prepareCanonical } from '../../../../tests/fixtures/canonical-database-request-fixture.js'
import {
	databaseAdapterConsumerPlugin,
	PostSchema,
	HookAuditSchema,
	BulkAccountSchema,
	AfterReadIdentitySchema,
	authorityPrincipal,
	authorityObservations,
	AuthorityRecordSchema,
	hookRollbackError,
	HookPostSchema,
	createInstant,
	updateInstant,
	uuidV7Pattern,
	allFieldValues,
	getFixture,
	expectPreparationPending,
} from './runtime-postgres-fixture.js'
import { registerRuntimeBulkTests } from './register-runtime-bulk-tests.js'

describe('Runtime to PostgreSQL', { concurrent: false }, () => {
	registerRuntimeBulkTests()

	it('executes schema commands and returns frozen plain mutation results', async () => {
		const auditReasons: string[] = []
		const ultimabase = new (UltimaBase.use(
			postgresPlugin({
				schemaPolicy: 'override',
				url: getFixture().connectionUri,
			}),
		))({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'model-command-master', value: 'unused-by-terminal' }],
				onUse: ({ reason }) => {
					auditReasons.push(reason)
				},
			}),
			schemas: [BulkAccountSchema],
			validation: {
				clock: () => new Date(createInstant),
				timezone: 'UTC',
			},
		})
		await ultimabase.start()

		try {
			// ADR-0310: schema commands replace model commands; results are data.
			const created = await BulkAccountSchema.createOne({
				data: {
					email: 'model-create@example.com',
					handle: 'model-create',
					tenantId: 'model-commands',
				},
				select: { email: true, id: true },
			})
			const upserted = await BulkAccountSchema.upsertOne({
				create: {
					email: 'model-upsert@example.com',
					handle: 'model-upsert',
					tenantId: 'model-commands',
				},
				select: { email: true, id: true, visits: true },
				update: { visits: { increment: 1 } },
				where: { email: { eq: 'model-upsert@example.com' } },
			})
			const selected = await BulkAccountSchema.findOne({
				where: { id: { eq: created.id } },
				select: { email: true },
			})

			if (selected === null) {
				throw new TypeError(
					'Model command E2E could not reload its selected row',
				)
			}
			const pointer = BulkAccountSchema.pointer(selected.id)
			const fetched = await BulkAccountSchema.findOneOrThrow({
				where: { id: { eq: selected.id } },
				select: { email: true, id: true, visits: true },
			})

			expect(pointer.schema).toBe(BulkAccountSchema)
			expect(pointer.id).toBe(created.id)
			expect(pointer.equals(BulkAccountSchema.pointer(created.id))).toBe(true)

			const updated = await BulkAccountSchema.updateOne(
				{
					where: { id: { eq: selected.id } },
					data: { visits: { increment: 2 } },
					select: { email: true, id: true, visits: true },
				},
				{ useMasterKey: true },
			)
			const deleted = await BulkAccountSchema.deleteOne(
				{
					where: { id: { eq: selected.id } },
					select: { email: true, id: true },
				},
				{ useMasterKey: true },
			)

			for (const result of [created, selected, fetched, updated, deleted]) {
				expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
				expect(Object.isFrozen(result)).toBe(true)
			}
			expect(created).toStrictEqual({
				email: 'model-create@example.com',
				id: created.id,
			})
			expect(upserted).toMatchObject({
				email: 'model-upsert@example.com',
				visits: 0,
			})
			expect(selected).toStrictEqual({
				email: 'model-create@example.com',
				id: created.id,
			})
			expect(fetched).toStrictEqual({
				email: 'model-create@example.com',
				id: created.id,
				visits: 0,
			})
			expect(updated).toStrictEqual({
				email: 'model-create@example.com',
				id: created.id,
				visits: 2,
			})
			expect(deleted).toStrictEqual({
				email: 'model-create@example.com',
				id: created.id,
			})
			expect(auditReasons).toStrictEqual([
				'Schema command update-one on RuntimeBulkAccount',
				'Schema command delete-one on RuntimeBulkAccount',
			])
			await expect(
				BulkAccountSchema.exists({ where: { id: { eq: created.id } } }),
			).resolves.toBe(false)
			await expect(
				BulkAccountSchema.exists({ where: { email: { eq: upserted.email } } }),
			).resolves.toBe(true)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('updates the selected row after an ordered read', async () => {
		const ultimabase = new (UltimaBase.use(
			postgresPlugin({
				schemaPolicy: 'override',
				url: getFixture().connectionUri,
			}),
		))({ schemas: [AfterReadIdentitySchema] })
		await ultimabase.start()

		try {
			const [first, second] = await AfterReadIdentitySchema.createMany({
				data: [{ title: 'First' }, { title: 'Second' }],
			})

			if (first === undefined || second === undefined) {
				throw new TypeError('Expected two identity fixtures')
			}

			const ordered = await AfterReadIdentitySchema.findMany({
				orderBy: { title: 'asc' },
				select: { title: true },
			})
			const selected = ordered[0]

			expect(ordered.map(({ title }) => title)).toStrictEqual([
				'First',
				'Second',
			])

			if (selected === undefined) {
				throw new TypeError('Expected a reordered row')
			}

			await AfterReadIdentitySchema.updateOne({
				where: { id: { eq: selected.id } },
				data: { title: 'First updated' },
			})

			const persistedFirst = await AfterReadIdentitySchema.findOne({
				where: { id: { eq: first.id } },
				select: { title: true },
			})
			const persistedSecond = await AfterReadIdentitySchema.findOne({
				where: { id: { eq: second.id } },
				select: { title: true },
			})

			expect(persistedFirst?.title).toBe('First updated')
			expect(persistedSecond?.title).toBe('Second')
		} finally {
			await ultimabase.dispose()
		}
	})

	it('executes plugin-derived and audited-master terminals against PostgreSQL', async () => {
		authorityObservations.length = 0
		const auditReasons: string[] = []
		const ultimabase = new (UltimaBase.use(
			hooksPlugin(),
			postgresPlugin({
				schemaPolicy: 'override',
				url: getFixture().connectionUri,
			}),
		))({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'postgres-server', value: 'unused-by-terminal' }],
				onUse: ({ reason }) => {
					auditReasons.push(reason)
				},
			}),
			schemas: [AuthorityRecordSchema],
			validation: {
				clock: () => new Date(createInstant),
				timezone: 'UTC',
			},
		})
		const context = RequestContext.anonymous({
			requestId: 'postgres-authority-context',
			source: requestSources.internal,
		}).withValue(authorityPrincipal, 'postgres-user')

		await ultimabase.start()

		try {
			const ordinary = await AuthorityRecordSchema.createOne(
				{ data: { title: 'plugin context' } },
				{ context },
			)
			const master = await AuthorityRecordSchema.createOne(
				{ data: { title: 'master context' } },
				{ context, useMasterKey: true },
			)

			expect(ordinary.title).toBe('plugin context')
			expect(master.title).toBe('master context')
			expect(authorityObservations).toStrictEqual([
				{ mode: 'anonymous', principal: 'postgres-user' },
				{ mode: 'master', principal: 'postgres-user' },
			])
			expect(auditReasons).toStrictEqual([
				'Schema command create-one on RuntimeAuthorityRecord',
			])
			await expect(AuthorityRecordSchema.count(undefined)).resolves.toBe(2)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('keeps HookContext nested writes in the primary PostgreSQL transaction', async () => {
		const ultimabase = new (UltimaBase.use(
			hooksPlugin(),
			postgresPlugin({
				schemaPolicy: 'override',
				url: getFixture().connectionUri,
			}),
		))({
			schemas: [HookPostSchema, HookAuditSchema],
			validation: {
				clock: () => new Date(createInstant),
				timezone: 'UTC',
			},
		})

		await ultimabase.start()

		try {
			const committed = await HookPostSchema.createOne({
				data: { title: 'commit' },
			})
			const audits = await HookAuditSchema.findMany({
				select: { action: true },
			})

			expect(Object.getPrototypeOf(committed)).toBe(Object.prototype)
			expect(committed).toMatchObject({ title: 'commit' })
			expect(
				audits.every(
					(audit) =>
						Object.isFrozen(audit) &&
						Object.getPrototypeOf(audit) === Object.prototype,
				),
			).toBe(true)
			expect(audits).toStrictEqual([
				{ action: 'create:commit', id: audits[0]?.id },
			])

			await expect(
				HookPostSchema.createOne({ data: { title: 'rollback' } }),
			).rejects.toBe(hookRollbackError)
			await expect(
				HookPostSchema.exists({ where: { title: { eq: 'rollback' } } }),
			).resolves.toBe(false)
			await expect(
				HookAuditSchema.exists({
					where: { action: { eq: 'create:rollback' } },
				}),
			).resolves.toBe(false)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('executes the complete public singular CRUD flow against live rows', async () => {
		const instants = [createInstant, updateInstant, createInstant]
		const clock = (): Date => {
			const instant = instants.shift()

			if (instant === undefined) {
				throw new TypeError('Runtime E2E clock received an unexpected mutation')
			}

			return new Date(instant)
		}
		const ultimabase = new (UltimaBase.use(
			postgresPlugin({
				schemaPolicy: 'override',
				url: getFixture().connectionUri,
			}),
		))({ schemas: [PostSchema], validation: { clock, timezone: 'UTC' } })
		await ultimabase.start()
		const connection = ultimabase.plugin(postgresPluginName).connection

		try {
			// One live row exercises every built-in field kind across the public boundary.
			const created = await PostSchema.createOne({ data: allFieldValues })

			expect(Object.getPrototypeOf(created)).toBe(Object.prototype)
			expect(created).toMatchObject({
				...allFieldValues,
				createdAt: createInstant,
				published: false,
				updatedAt: createInstant,
				views: 0,
			})
			expect(created.id).toMatch(uuidV7Pattern)
			expect(created.attachment).not.toBe(allFieldValues.attachment)

			const found = await PostSchema.findMany({
				where: {
					published: { eq: false },
					views: { gte: 0 },
				},
				select: { id: true, title: true },
			})

			expect(
				found.every(
					(post) =>
						Object.isFrozen(post) &&
						Object.getPrototypeOf(post) === Object.prototype,
				),
			).toBe(true)
			expect(found).toStrictEqual([{ id: created.id, title: 'First real E2E' }])

			const listed = await PostSchema.findMany({
				where: {
					id: { eq: created.id },
					labels: {
						eq: ['typed', 'postgres'],
						has: 'typed',
						hasEvery: ['typed', 'postgres'],
						hasSome: ['missing', 'postgres'],
					},
				},
				select: { id: true },
			})

			expect(listed.map((post) => post.id)).toStrictEqual([created.id])
			expect(
				await PostSchema.findMany({
					where: {
						id: { eq: created.id },
						labels: { isEmpty: true },
					},
					select: { id: true },
				}),
			).toStrictEqual([])

			const updated = await PostSchema.updateOne({
				where: { id: created.id },
				data: {
					views: { increment: 2 },
					published: true,
					title: 'Persisted E2E',
				},
				select: { id: true, title: true, views: true },
			})

			expect(Object.getPrototypeOf(updated)).toBe(Object.prototype)
			expect(updated).toStrictEqual({
				id: created.id,
				title: 'Persisted E2E',
				views: 2,
			})

			const deleted = await PostSchema.deleteOne({
				where: { id: created.id },
				select: { id: true, title: true },
			})

			expect(Object.getPrototypeOf(deleted)).toBe(Object.prototype)
			expect(deleted).toStrictEqual({
				id: created.id,
				title: 'Persisted E2E',
			})
			await expect(
				PostSchema.findMany({ where: { id: { eq: created.id } } }),
			).resolves.toStrictEqual([])

			const selectedCreate = await PostSchema.createOne({
				data: { ...allFieldValues, title: 'Selected create E2E' },
				select: { id: true, title: true },
			})

			expect(Object.getPrototypeOf(selectedCreate)).toBe(Object.prototype)
			expect(selectedCreate).toStrictEqual({
				id: selectedCreate.id,
				title: 'Selected create E2E',
			})
			await PostSchema.deleteOne({ where: { id: { eq: selectedCreate.id } } })
			await expect(PostSchema.count(undefined)).resolves.toBe(0)
			await expect(PostSchema.exists(undefined)).resolves.toBe(false)
		} finally {
			await ultimabase.dispose()
		}

		expect(connection.state).toBe('closed')
	})

	it('commits and rolls back explicit Runtime transactions on one PostgreSQL client', async () => {
		const instants = [createInstant, updateInstant]
		const ultimabase = new (UltimaBase.use(
			postgresPlugin({
				schemaPolicy: 'override',
				url: getFixture().connectionUri,
			}),
		))({
			schemas: [PostSchema],
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
		const request = ultimabase.anonymous({
			requestId: 'postgres-transaction-e2e',
			source: requestSources.internal,
		})
		const rollbackError = new Error('rollback transaction fixture')

		try {
			const committed = await request.transaction(() =>
				PostSchema.createOne({ data: { title: 'Committed transaction' } }),
			)
			expect(Object.getPrototypeOf(committed)).toBe(Object.prototype)

			const found = await runWithRequestEngine(request, () =>
				PostSchema.findOne({
					where: { id: { eq: committed.id } },
					select: { id: true, title: true },
				}),
			)

			expect(Object.getPrototypeOf(found)).toBe(Object.prototype)
			expect(found).toStrictEqual({
				id: committed.id,
				title: 'Committed transaction',
			})

			await expect(
				request.transaction(async () => {
					await PostSchema.createOne({
						data: {
							title: 'Rolled back transaction',
						},
					})
					throw rollbackError
				}),
			).rejects.toBe(rollbackError)
			await expect(
				runWithRequestEngine(request, () =>
					PostSchema.exists({
						where: { title: { eq: 'Rolled back transaction' } },
					}),
				),
			).resolves.toBe(false)

			await runWithRequestEngine(request, () =>
				PostSchema.deleteOne({
					where: { id: { eq: committed.id } },
				}),
			)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('keeps prepared update and delete targets stable across concurrent transactions', async () => {
		const ultimabase = new (UltimaBase.use(
			postgresPlugin({
				schemaPolicy: 'override',
				url: getFixture().connectionUri,
			}),
			databaseAdapterConsumerPlugin,
		))({
			schemas: [PostSchema],
			validation: { clock: () => new Date(createInstant), timezone: 'UTC' },
		})
		await ultimabase.start()
		const adapter = ultimabase.plugin(
			'fixture.runtime-postgres.adapter-consumer',
		)
		const transactions: DatabaseTransactionAdapter[] = []

		try {
			const updatedTarget = await PostSchema.createOne({
				data: { title: 'Original update target' },
			})
			const updateQuery = new QueryBuilder(PostSchema)
				.where((where) => where.eq('id', updatedTarget.id))
				.select({ id: true, title: true })
			const firstUpdate = normalizeUpdateExpression(PostSchema, {
				title: 'First committed update',
			})
			const secondUpdate = normalizeUpdateExpression(PostSchema, {
				title: 'Second committed update',
			})
			const firstTransaction = await adapter.beginTransaction()
			const secondTransaction = await adapter.beginTransaction()
			transactions.push(firstTransaction, secondTransaction)
			const firstPrepared = await prepareCanonical(firstTransaction, {
				kind: 'update-one',
				query: updateQuery.ast,
				update: firstUpdate,
			})
			const secondPreparation = prepareCanonical(secondTransaction, {
				kind: 'update-one',
				query: updateQuery.ast,
				update: secondUpdate,
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

			const deletedTarget = await PostSchema.createOne({
				data: { title: 'Stable delete target' },
			})
			const deleteQuery = new QueryBuilder(PostSchema)
				.where((where) => where.eq('id', deletedTarget.id))
				.select({ id: true, title: true })
			const deleteTransaction = await adapter.beginTransaction()
			const competingTransaction = await adapter.beginTransaction()
			transactions.push(deleteTransaction, competingTransaction)
			const preparedDelete = await prepareCanonical(deleteTransaction, {
				kind: 'delete-one',
				query: deleteQuery.ast,
			})
			const competingPreparation = prepareCanonical(competingTransaction, {
				kind: 'update-one',
				query: deleteQuery.ast,
				update: firstUpdate,
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
