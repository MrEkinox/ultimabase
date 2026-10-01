import {
	UltimaBase,
	contributeOperation,
	defineOperation,
	defineOperationValue,
	plugin,
	contributeDeclarations,
	definePrivateCollection,
	privateStore,
	stringField,
	uuidField,
} from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../../../../tests/fixtures/postgres-worker-fixture.js'

let fixture: PostgresWorkerFixture | undefined

const getFixture = (): PostgresWorkerFixture => {
	if (fixture === undefined)
		throw new TypeError('PostgreSQL fixture is unavailable')
	return fixture
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture()
}, 30_000)

afterAll(async () => {
	await fixture?.dispose()
})

const Account = UltimaBase.Schema.define({
	className: 'PrivateStoragePostgresAccount',
	fields: (field) => ({ name: field.string({ required: true }) }),
})

const sessions = definePrivateCollection({
	contributionId: 'sessions',
	fields: {
		accountId: uuidField({ immutable: true, required: true }),
		secret: stringField({ immutable: true, required: true }),
		version: stringField({ required: true }),
	},
	indexes: [{ fields: ['secret'] }] as const,
	references: [{ field: 'accountId', onDelete: 'cascade', target: Account }],
})

const actionValue = defineOperationValue((value) => {
	if (!isPlainRecord(value) || typeof value.action !== 'string') {
		throw new TypeError('action is required')
	}
	return immutableRecord({ action: value.action })
})
const resultValue = defineOperationValue((value) => {
	if (typeof value !== 'string') throw new TypeError('result must be a string')
	return value
})
const sessionOperation = defineOperation({
	input: actionValue,
	name: 'fixture.private-postgres.session',
	result: resultValue,
	target: 'application',
	transaction: 'optional',
	version: '1.0.0',
})
const atomicOperation = defineOperation({
	input: actionValue,
	name: 'fixture.private-postgres.atomic',
	result: resultValue,
	target: 'application',
	transaction: 'required',
	version: '1.0.0',
})

describe('PostgreSQL owner-private storage', { concurrent: false }, () => {
	it('enforces unique, CAS, reference, and shared transaction semantics', async () => {
		let accountId = ''
		const sessionContribution = contributeOperation({
			operation: sessionOperation,
			execute: async ({ input }) => {
				const store = privateStore(sessions)
				switch (input.action) {
					case 'insert':
						await store.insert({
							data: { accountId, secret: 'session-a', version: '1' },
						})
						return 'inserted'
					case 'duplicate':
						await store.insert({
							data: { accountId, secret: 'session-a', version: '1' },
						})
						return 'duplicated'
					case 'read':
						return (
							(await store.findUnique({ where: { secret: 'session-a' } }))
								?.version ?? 'missing'
						)
					case 'race':
						return (
							(
								await store.compareAndSwap({
									data: { version: '2' },
									expected: { version: '1' },
									where: { secret: 'session-a' },
								})
							)?.version ?? 'conflict'
						)
					case 'read-rollback':
						return (await store.findUnique({
							where: { secret: 'rolled-back' },
						})) === null
							? 'missing'
							: 'present'
					default:
						return 'unknown'
				}
			},
		})
		const atomicContribution = contributeOperation({
			operation: atomicOperation,
			execute: async () => {
				const account = await new Account({ name: 'rolled-back' }).create({})
				if (typeof account.id !== 'string') {
					throw new TypeError('Created account ID is unavailable')
				}
				await privateStore(sessions).insert({
					data: { accountId: account.id, secret: 'rolled-back', version: '1' },
				})
				throw new Error('rollback both stores')
			},
		})
		const privatePlugin = plugin({
			core: '^0.0.0',
			id: 'fixture.private-postgres',
			permissions: {
				'operation:declare': 'Declares private storage fixtures.',
				'storage:private': 'Stores private session fixtures.',
			},
			version: '1.0.0',
			contributions: [
				sessionContribution,
				atomicContribution,
				contributeDeclarations({
					privateStorage: ({ privateStorage }) => {
						privateStorage.register(sessions)

						return undefined
					},
				}),
			],
		})
		const ultimabase = new (UltimaBase.use(
			postgresPlugin({ pool: getFixture().pool, schemaPolicy: 'override' }),
			privatePlugin,
		))({
			pluginPrivileges: { logger: false },
			schemas: [Account],
		})
		await ultimabase.start()

		try {
			const account = await new Account({ name: 'cascade' }).create(
				{},
				{ ultimabase },
			)
			accountId = account.id
			expect(
				await ultimabase
					.operation(sessionOperation)
					.execute({ action: 'insert' }),
			).toBe('inserted')
			expect(
				await ultimabase
					.operation(sessionOperation)
					.execute({ action: 'read' }),
			).toBe('1')
			await expect(
				ultimabase.operation(sessionOperation).execute({ action: 'duplicate' }),
			).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })

			const race = await Promise.all([
				ultimabase.operation(sessionOperation).execute({ action: 'race' }),
				ultimabase.operation(sessionOperation).execute({ action: 'race' }),
			])
			expect(race.sort()).toStrictEqual(['2', 'conflict'])

			await account.delete({}, { ultimabase })
			expect(
				await ultimabase
					.operation(sessionOperation)
					.execute({ action: 'read' }),
			).toBe('missing')

			await expect(
				ultimabase.operation(atomicOperation).execute({ action: 'rollback' }),
			).rejects.toThrow('handler failed')
			expect(
				await Account.findOne(
					{ where: { name: { eq: 'rolled-back' } } },
					{ ultimabase },
				),
			).toBeNull()
			expect(
				await ultimabase
					.operation(sessionOperation)
					.execute({ action: 'read-rollback' }),
			).toBe('missing')
		} finally {
			await ultimabase.dispose()
		}
	})

	it('upgrades stable physical intent and retains removed collections as inert orphans', async () => {
		const v1Collection = definePrivateCollection({
			contributionId: 'upgrade-state',
			fields: { secret: stringField({ required: true }) },
			indexes: [{ fields: ['secret'] }] as const,
		})
		const v2Collection = definePrivateCollection({
			contributionId: 'upgrade-state',
			fields: {
				note: stringField(),
				secret: stringField({ required: true }),
			},
			indexes: [{ fields: ['secret'] }] as const,
		})
		const declareOnly = (
			collection: typeof v1Collection | typeof v2Collection,
			version: '1.0.0' | '2.0.0',
		) =>
			plugin({
				core: '^0.0.0',
				id: 'fixture.private-postgres-upgrade',
				permissions: { 'storage:private': 'Tests private schema upgrades.' },
				version,
				contributions: [
					contributeDeclarations({
						privateStorage: ({ privateStorage }) => {
							privateStorage.register(collection)
							return undefined
						},
					}),
				],
			})
		const readPrivateTables = async (): Promise<readonly string[]> => {
			const result = await getFixture().pool.query<{
				readonly table_name: string
			}>(
				`SELECT table_name
				 FROM information_schema.tables
				 WHERE table_schema = current_schema()
				   AND table_name LIKE '_ub_private_%'
				 ORDER BY table_name`,
			)
			return result.rows.map(({ table_name: tableName }) => tableName)
		}
		const before = await readPrivateTables()
		const v1 = new (UltimaBase.use(
			postgresPlugin({ pool: getFixture().pool, schemaPolicy: 'override' }),
			declareOnly(v1Collection, '1.0.0'),
		))({
			pluginPrivileges: { logger: false },
			schemas: [],
		})
		await v1.start()
		await v1.dispose()
		const afterV1 = await readPrivateTables()
		const tableName = afterV1.find((candidate) => !before.includes(candidate))
		if (tableName === undefined)
			throw new TypeError('Private upgrade table was not created')

		const v2 = new (UltimaBase.use(
			postgresPlugin({ pool: getFixture().pool, schemaPolicy: 'override' }),
			declareOnly(v2Collection, '2.0.0'),
		))({
			pluginPrivileges: { logger: false },
			schemas: [],
		})
		await v2.start()
		await v2.dispose()
		expect(await readPrivateTables()).toStrictEqual(afterV1)
		const columns = await getFixture().pool.query<{
			readonly column_name: string
		}>(
			`SELECT column_name
			 FROM information_schema.columns
			 WHERE table_schema = current_schema() AND table_name = $1
			 ORDER BY column_name`,
			[tableName],
		)
		expect(
			columns.rows.map(({ column_name: columnName }) => columnName),
		).toStrictEqual(['note', 'secret'])

		const noConsumer = new (UltimaBase.use(
			postgresPlugin({ pool: getFixture().pool, schemaPolicy: 'override' }),
		))({ pluginPrivileges: { logger: false }, schemas: [] })
		await noConsumer.start()
		await noConsumer.dispose()
		expect(await readPrivateTables()).toContain(tableName)
	})
})
