import {
	postgresConnectionServiceToken,
	postgresPlugin,
} from '@ultimabase/postgres-plugin'
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
	RequestContext,
	RequestContextValue,
	requestSources,
	type SchemaResult,
	runWithRequestEngine,
	stringField,
	timeField,
	uuidField,
	MasterAuthority,
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

const BulkAccountSchema = Schema.define({
	className: 'RuntimeBulkAccount',
	fields: {
		email: stringField({
			indexed: 'unique',
			validation: { required: true },
		}),
		handle: stringField({ validation: { required: true } }),
		tenantId: stringField({ validation: { required: true } }),
		visits: intField({ default: 0 }),
	},
	indexes: [{ fields: ['tenantId', 'handle'], unique: true }],
})

const authorityPrincipal = new RequestContextValue<string>(
	'fixture.postgres.principal',
	(value: unknown): string => {
		if (typeof value !== 'string') {
			throw new TypeError('PostgreSQL fixture principal must be a string')
		}

		return value
	},
)
const authorityObservations: Readonly<{
	mode: string
	principal: string | undefined
}>[] = []
const AuthorityRecordSchema = Schema.define({
	className: 'RuntimeAuthorityRecord',
	fields: {
		title: stringField({ validation: { required: true } }),
	},
	hooks: {
		beforeCreate: ({ context, operation }) => {
			// Snapshot revocable hook capabilities before the callback completes.
			authorityObservations.push({
				mode: context.access.mode,
				principal: context.getValue(authorityPrincipal),
			})

			return operation
		},
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

			await new HookAuditSchema({
				action: `create:${operation.input.title}`,
			}).create()

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
const PackedModelSchema = Schema.define({
	className: 'PackedModel',
	fields: { title: stringField() },
})
const packedModelDraft = new PackedModelSchema({ title: 'Packed model draft' })
const packedQuery = PostSchema.query().select('id', 'title')
const packedNonAtomicCreate = () =>
	PostSchema.query().createMany([{ title: 'Packed bulk draft' }], {
		atomic: false,
	})
declare const packedContext: RequestContext
const packedMasterFind = () => PostSchema.query().find({ useMasterKey: true })
const packedContextFind = () =>
	PostSchema.query().find({ context: packedContext })
const packedDraftCreate = () => packedModelDraft.create({ useMasterKey: true })
declare const packedResult: SchemaResult<
	typeof PackedModelSchema,
	{ readonly title: string }
>
const packedModelUpdate = () =>
	packedResult.update({ set: { title: 'Packed update' } })
const packedQueryUpdate = () =>
	PostSchema.query().update({ set: { title: 'Packed query update' } })
const packedQueryDelete = () =>
	PostSchema.query().delete({ context: packedContext })
void packedDraft
void packedModelDraft
void packedQuery
void packedNonAtomicCreate
void packedMasterFind
void packedContextFind
void packedDraftCreate
void packedModelUpdate
void packedQueryUpdate
void packedQueryDelete

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
	it('executes ordered bulk, recoverable prefixes, set writes, and unique upserts', async () => {
		const ultimabase = new UltimaBase({
			schemas: [BulkAccountSchema],
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
			const ordered = await BulkAccountSchema.query().createMany(
				[
					{
						email: 'second@example.com',
						handle: 'second',
						tenantId: 'tenant-a',
					},
					{
						email: 'first@example.com',
						handle: 'first',
						tenantId: 'tenant-a',
					},
				],
				{ ultimabase },
			)

			expect(ordered.map(({ email }) => email)).toStrictEqual([
				'second@example.com',
				'first@example.com',
			])
			await expect(
				BulkAccountSchema.query()
					.equalTo('tenantId', 'tenant-a')
					.ascending('email')
					.limit(1)
					.updateMany({ increment: { visits: 2 } }, { ultimabase }),
			).resolves.toBe(1)

			const createdUpsert = await BulkAccountSchema.query()
				.equalTo('email', 'upsert@example.com')
				.select('email', 'visits')
				.upsert(
					{
						create: {
							email: 'upsert@example.com',
							handle: 'upsert',
							tenantId: 'tenant-b',
						},
						update: { increment: { visits: 1 } },
					},
					{ ultimabase },
				)
			expect(createdUpsert.toJSON()).toStrictEqual({
				email: 'upsert@example.com',
				visits: 0,
			})

			const updatedUpsert = await BulkAccountSchema.query()
				.equalTo('email', 'upsert@example.com')
				.select('email', 'visits')
				.upsert(
					{
						create: {
							email: 'upsert@example.com',
							handle: 'upsert',
							tenantId: 'tenant-b',
						},
						update: { increment: { visits: 1 } },
					},
					{ ultimabase },
				)
			expect(updatedUpsert.toJSON()).toStrictEqual({
				email: 'upsert@example.com',
				visits: 1,
			})

			const composite = await BulkAccountSchema.query()
				.equalTo('handle', 'composite')
				.equalTo('tenantId', 'tenant-c')
				.upsert(
					{
						create: {
							email: 'composite@example.com',
							handle: 'composite',
							tenantId: 'tenant-c',
						},
						update: { increment: { visits: 1 } },
					},
					{ ultimabase },
				)
			expect(composite).toMatchObject({
				handle: 'composite',
				tenantId: 'tenant-c',
				visits: 0,
			})

			const partial = await BulkAccountSchema.query().createMany(
				[
					{
						email: 'prefix@example.com',
						handle: 'prefix',
						tenantId: 'tenant-d',
					},
					{
						email: 'upsert@example.com',
						handle: 'duplicate',
						tenantId: 'tenant-d',
					},
					{
						email: 'suffix@example.com',
						handle: 'suffix',
						tenantId: 'tenant-d',
					},
				],
				{ atomic: false, ultimabase },
			)

			expect(partial.status).toBe('stopped')
			if (partial.status === 'stopped') {
				expect(partial.failedIndex).toBe(1)
				expect(partial.results.map(({ email }) => email)).toStrictEqual([
					'prefix@example.com',
				])
				expect(partial.error).toMatchObject({ code: 'VALIDATION_ERROR' })
			}
			await expect(
				BulkAccountSchema.query()
					.equalTo('email', 'prefix@example.com')
					.exists({ ultimabase }),
			).resolves.toBe(true)
			await expect(
				BulkAccountSchema.query()
					.equalTo('email', 'suffix@example.com')
					.exists({ ultimabase }),
			).resolves.toBe(false)

			await expect(
				BulkAccountSchema.query().createMany(
					[
						{
							email: 'atomic-duplicate@example.com',
							handle: 'atomic-first',
							tenantId: 'tenant-atomic',
						},
						{
							email: 'atomic-duplicate@example.com',
							handle: 'atomic-second',
							tenantId: 'tenant-atomic',
						},
					],
					{ ultimabase },
				),
			).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
			await expect(
				BulkAccountSchema.query()
					.equalTo('tenantId', 'tenant-atomic')
					.exists({ ultimabase }),
			).resolves.toBe(false)

			const concurrent = await Promise.all([
				BulkAccountSchema.query()
					.equalTo('email', 'concurrent@example.com')
					.upsert(
						{
							create: {
								email: 'concurrent@example.com',
								handle: 'concurrent',
								tenantId: 'tenant-e',
							},
							update: { increment: { visits: 1 } },
						},
						{ ultimabase },
					),
				BulkAccountSchema.query()
					.equalTo('email', 'concurrent@example.com')
					.upsert(
						{
							create: {
								email: 'concurrent@example.com',
								handle: 'concurrent',
								tenantId: 'tenant-e',
							},
							update: { increment: { visits: 1 } },
						},
						{ ultimabase },
					),
			])
			expect(concurrent.map(({ visits }) => visits).sort()).toStrictEqual([
				0, 1,
			])
			await expect(
				BulkAccountSchema.query()
					.equalTo('tenantId', 'tenant-d')
					.deleteMany({ ultimabase }),
			).resolves.toBe(1)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('executes immutable model commands while keeping selected identity private', async () => {
		const auditReasons: string[] = []
		const ultimabase = new UltimaBase({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'model-command-master', value: 'unused-by-terminal' }],
				onUse: ({ reason }) => {
					auditReasons.push(reason)
				},
			}),
			schemas: [BulkAccountSchema],
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
			const draft = new BulkAccountSchema({
				email: 'model-create@example.com',
				handle: 'model-create',
				tenantId: 'model-commands',
			})
			const created = await draft.create({ ultimabase })
			const upserted = await new BulkAccountSchema({
				email: 'model-upsert@example.com',
				handle: 'model-upsert',
				tenantId: 'model-commands',
			}).upsert(
				{
					update: { increment: { visits: 1 } },
					where: { email: 'model-upsert@example.com' },
				},
				{ ultimabase },
			)
			const selected = await BulkAccountSchema.query()
				.byId(created.id)
				.select('email')
				.first({ ultimabase })

			if (selected === null) {
				throw new TypeError(
					'Model command E2E could not reload its selected row',
				)
			}

			const updated = await selected.update(
				{ increment: { visits: 2 } },
				{ ultimabase, useMasterKey: true },
			)
			const deleted = await updated?.delete({
				ultimabase,
				useMasterKey: true,
			})

			expect(draft.toJSON()).toStrictEqual({
				email: 'model-create@example.com',
				handle: 'model-create',
				tenantId: 'model-commands',
			})
			expect(created).toBeInstanceOf(BulkAccountSchema)
			expect(upserted).toMatchObject({
				email: 'model-upsert@example.com',
				visits: 0,
			})
			expect(selected.toJSON()).toStrictEqual({
				email: 'model-create@example.com',
			})
			expect(updated?.toJSON()).toStrictEqual({
				email: 'model-create@example.com',
			})
			expect(deleted?.toJSON()).toStrictEqual({
				email: 'model-create@example.com',
			})
			expect(selected).not.toHaveProperty('id')
			expect(updated).not.toHaveProperty('id')
			expect(deleted).not.toHaveProperty('id')
			expect(auditReasons).toStrictEqual([
				'Query terminal update-one on RuntimeBulkAccount',
				'Query terminal delete-one on RuntimeBulkAccount',
			])
			await expect(
				BulkAccountSchema.query().byId(created.id).exists({ ultimabase }),
			).resolves.toBe(false)
			await expect(
				BulkAccountSchema.query()
					.equalTo('email', upserted.email)
					.exists({ ultimabase }),
			).resolves.toBe(true)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('executes plugin-derived and audited-master terminals against PostgreSQL', async () => {
		authorityObservations.length = 0
		const auditReasons: string[] = []
		const ultimabase = new UltimaBase({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'postgres-server', value: 'unused-by-terminal' }],
				onUse: ({ reason }) => {
					auditReasons.push(reason)
				},
			}),
			schemas: [AuthorityRecordSchema],
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
		const context = RequestContext.anonymous({
			requestId: 'postgres-authority-context',
			source: requestSources.internal,
		}).withValue(authorityPrincipal, 'postgres-user')

		await ultimabase.start()

		try {
			const ordinary = await AuthorityRecordSchema.query().create(
				{ title: 'plugin context' },
				{ context, ultimabase },
			)
			const master = await AuthorityRecordSchema.query().create(
				{ title: 'master context' },
				{ context, ultimabase, useMasterKey: true },
			)

			expect(ordinary.title).toBe('plugin context')
			expect(master.title).toBe('master context')
			expect(authorityObservations).toStrictEqual([
				{ mode: 'anonymous', principal: 'postgres-user' },
				{ mode: 'master', principal: 'postgres-user' },
			])
			expect(auditReasons).toStrictEqual([
				'Query terminal create-one on RuntimeAuthorityRecord',
			])
			await expect(
				AuthorityRecordSchema.query().count({ ultimabase }),
			).resolves.toBe(2)
		} finally {
			await ultimabase.dispose()
		}
	})

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
