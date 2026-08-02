import {
	Query,
	normalizeUpdateExpression,
	type CreateOneOperationAst,
	type DeleteOneOperationAst,
	type FindOperationAst,
	type QueryFilterNode,
	type UpdateOneOperationAst,
} from '@ultimabase/core'
import { Schema, intField, stringField } from '@ultimabase/core'
import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'
import {
	createRuntimeValidationStage,
	RequestContext,
	requestSources,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { createPostgresDatabaseAdapter } from './adapter.js'
import type { PostgresDriverQueryClient } from './client.js'
import type {
	PostgresPool,
	PostgresPoolClient,
} from '../connection/contracts.js'
import { PostgresSchemaCatalog } from '../schema/catalog.js'

const articleSchema = new Schema({
	className: 'Article',
	fields: {
		note: stringField(),
		title: stringField({ validation: { required: true } }),
		views: intField(),
	},
})

interface RecordedDriverQuery {
	readonly params: readonly unknown[]
	readonly text: string
}

interface FixtureDriverResult {
	readonly rows: readonly (readonly unknown[])[]
}

type TransactionStatement = 'BEGIN' | 'COMMIT' | 'ROLLBACK'

/** Emulates only node-postgres' query boundary while Drizzle builds and maps real SQL. */
class FixtureDriver implements PostgresDriverQueryClient, PostgresPoolClient {
	readonly #responses: (Error | FixtureDriverResult)[] = []
	readonly #transactionFailures = new Map<TransactionStatement, Error>()
	readonly calls: RecordedDriverQuery[] = []
	readonly transactionCalls: TransactionStatement[] = []
	readonly releaseArguments: (Error | boolean | undefined)[] = []
	releaseCalls = 0
	#releaseFailure: Error | undefined

	respond(rows: readonly (readonly unknown[])[]): void {
		this.#responses.push({ rows })
	}

	fail(error: Error): void {
		this.#responses.push(error)
	}

	failTransaction(statement: TransactionStatement, error: Error): void {
		this.#transactionFailures.set(statement, error)
	}

	failRelease(error: Error): void {
		this.#releaseFailure = error
	}

	query(...arguments_: unknown[]): Promise<FixtureDriverResult> {
		const values: readonly unknown[] = arguments_
		const configuration = values[0]
		const parameters = values[1]

		if (
			configuration === 'BEGIN' ||
			configuration === 'COMMIT' ||
			configuration === 'ROLLBACK'
		) {
			this.transactionCalls.push(configuration)
			const failure = this.#transactionFailures.get(configuration)

			return failure === undefined
				? Promise.resolve({ rows: [] })
				: Promise.reject(failure)
		}

		if (
			!isPlainRecord(configuration) ||
			typeof configuration.text !== 'string' ||
			!isUnknownArray(parameters)
		) {
			return Promise.reject(new TypeError('Invalid Drizzle fixture query'))
		}

		this.calls.push({ params: parameters, text: configuration.text })

		const response = this.#responses.shift()

		if (response === undefined) {
			return Promise.reject(new TypeError('Missing Drizzle fixture response'))
		}

		return response instanceof Error
			? Promise.reject(response)
			: Promise.resolve(response)
	}

	release(error?: Error | boolean): void {
		this.releaseCalls += 1
		this.releaseArguments.push(error)

		if (this.#releaseFailure !== undefined) {
			throw this.#releaseFailure
		}
	}
}

/** Borrows the exact fixture driver used by each transaction adapter. */
class FixturePool implements PostgresPool {
	readonly #connectError: Error | undefined
	readonly #rootDriver: FixtureDriver
	readonly #transactionDrivers: readonly FixtureDriver[]
	connectCalls = 0

	constructor(
		rootDriver: FixtureDriver,
		transactionDrivers: readonly FixtureDriver[],
		connectError?: Error,
	) {
		this.#connectError = connectError
		this.#rootDriver = rootDriver
		this.#transactionDrivers = transactionDrivers
	}

	connect(): Promise<PostgresPoolClient> {
		this.connectCalls += 1
		const client = this.#transactionDrivers[this.connectCalls - 1]

		if (this.#connectError !== undefined) {
			return Promise.reject(this.#connectError)
		}

		if (client === undefined) {
			return Promise.reject(
				new TypeError('Missing PostgreSQL transaction fixture client'),
			)
		}

		return Promise.resolve(client)
	}

	end(): Promise<void> {
		return Promise.resolve()
	}

	query(...arguments_: unknown[]): Promise<FixtureDriverResult> {
		return this.#rootDriver.query(...arguments_)
	}
}

const createFixture = (transactionCount = 1, connectError?: Error) => {
	const driver = new FixtureDriver()
	const transactionDrivers = Array.from(
		{ length: transactionCount },
		() => new FixtureDriver(),
	)
	const pool = new FixturePool(driver, transactionDrivers, connectError)
	const adapter = createPostgresDatabaseAdapter(
		pool,
		new PostgresSchemaCatalog([articleSchema]),
	)

	return { adapter, driver, pool, transactionDrivers }
}

/** Reads one deliberately separate borrowed client without weakening test types. */
const getTransactionDriver = (
	fixture: ReturnType<typeof createFixture>,
	index = 0,
): FixtureDriver => {
	const driver = fixture.transactionDrivers[index]

	if (driver === undefined) {
		throw new TypeError('Missing transaction fixture driver')
	}

	return driver
}

const firstId = '0198c3d4-1000-7000-8000-000000000001'
const secondId = '0198c3d4-1000-7000-8000-000000000002'
const timestamp = '2026-08-01T10:00:00.000Z'

describe('internal PostgreSQL database adapter', () => {
	it('executes every singular read contract through parameterized Drizzle SQL', async () => {
		const { adapter, driver } = createFixture()
		const query = new Query(articleSchema)
			.greaterThan('views', 10)
			.select('id', 'title')
			.descending('views')
			.limit(2)
		const find = {
			kind: 'find',
			query: query.ast,
		} satisfies FindOperationAst<
			typeof articleSchema,
			QueryFilterNode<typeof articleSchema>,
			'id' | 'title'
		>

		driver.respond([
			[firstId, 'First'],
			[secondId, 'Second'],
		])
		await expect(
			adapter.execute({ accessConstraints: [], operation: find }),
		).resolves.toStrictEqual([
			{ id: firstId, title: 'First' },
			{ id: secondId, title: 'Second' },
		])
		expect(driver.calls.at(-1)).toMatchObject({
			params: [10, 2],
		})
		expect(driver.calls.at(-1)?.text).toMatch(
			/select .* from "articles" where .* > \$1 order by .* desc NULLS FIRST limit \$2/u,
		)

		driver.respond([])
		await expect(
			adapter.execute({
				accessConstraints: [],
				operation: { kind: 'first', query: query.ast },
			}),
		).resolves.toBeNull()

		driver.respond([])
		await expect(
			adapter.execute({
				accessConstraints: [],
				operation: { kind: 'get', query: query.ast, id: firstId },
			}),
		).resolves.toBeNull()
		expect(driver.calls.at(-1)?.params).toContain(firstId)

		driver.respond([[2]])
		await expect(
			adapter.execute({
				accessConstraints: [],
				operation: { kind: 'count', query: query.ast },
			}),
		).resolves.toBe(2)
		expect(driver.calls.at(-1)?.text).toContain('ultimabase_count_target')

		driver.respond([[firstId]])
		await expect(
			adapter.execute({
				accessConstraints: [],
				operation: { kind: 'exists', query: query.ast },
			}),
		).resolves.toBe(true)
	})

	it('persists Runtime-generated identity and timestamps without regenerating them', async () => {
		const { adapter, driver } = createFixture()
		const validation = createRuntimeValidationStage({
			clock: () => new Date(timestamp),
			uuidV7Generator: () => firstId,
		})
		const operation: CreateOneOperationAst<typeof articleSchema> = {
			input: { title: 'Created' },
			kind: 'create-one',
			schema: new Query(articleSchema).ast.schema,
		}
		const normalized = await validation({
			context: RequestContext.anonymous({
				requestId: 'postgres-create-fixture',
				source: requestSources.internal,
			}),
			operation,
		})

		driver.respond([[null, 'Created', null, firstId, timestamp, timestamp]])
		await expect(
			adapter.execute({ accessConstraints: [], operation: normalized }),
		).resolves.toStrictEqual({
			createdAt: timestamp,
			id: firstId,
			title: 'Created',
			updatedAt: timestamp,
		})
		expect(driver.calls[0]?.params).toStrictEqual([
			'Created',
			firstId,
			timestamp,
			timestamp,
		])
	})

	it('updates and deletes the deterministic first match through an id subquery', async () => {
		const { adapter, driver } = createFixture()
		const query = new Query(articleSchema)
			.equalTo('title', 'Old')
			.select('id', 'title')
			.descending('views')
		const update = normalizeUpdateExpression(articleSchema, {
			set: { title: 'Updated' },
			increment: { views: 1 },
		})
		const updateOperation = {
			kind: 'update-one',
			query: query.ast,
			update,
		} satisfies UpdateOneOperationAst<typeof articleSchema, typeof update>
		const deleteOperation = {
			kind: 'delete-one',
			query: query.ast,
		} satisfies DeleteOneOperationAst<typeof articleSchema>

		driver.respond([[firstId, 'Updated']])
		await expect(
			adapter.execute({ accessConstraints: [], operation: updateOperation }),
		).resolves.toStrictEqual({ id: firstId, title: 'Updated' })
		expect(driver.calls.at(-1)?.text).toMatch(
			/update "articles" set .* where "articles"\."id" in \(select/u,
		)

		driver.respond([[firstId, 'Updated']])
		await expect(
			adapter.execute({ accessConstraints: [], operation: deleteOperation }),
		).resolves.toStrictEqual({ id: firstId, title: 'Updated' })
		expect(driver.calls.at(-1)?.text).toMatch(
			/delete from "articles" where "articles"\."id" in \(select/u,
		)

		driver.respond([])
		await expect(
			adapter.execute({ accessConstraints: [], operation: updateOperation }),
		).resolves.toBeNull()
	})

	it('fails closed for unsupported access, bulk, and driver errors', async () => {
		const { adapter, driver } = createFixture()
		const operation = {
			kind: 'find',
			query: new Query(articleSchema).ast,
		} satisfies FindOperationAst<typeof articleSchema>

		await expect(
			adapter.execute({
				accessConstraints: [{ kind: 'future-row-constraint' }],
				operation,
			}),
		).rejects.toMatchObject({
			code: 'INTERNAL_ERROR',
			internalDetails: {
				kind: 'postgres-access-constraint-unsupported',
			},
		})

		await expect(
			adapter.execute({
				accessConstraints: [],
				operation: {
					inputs: [],
					kind: 'create-many',
					options: { atomic: true },
					schema: operation.query.schema,
				},
			}),
		).rejects.toMatchObject({
			code: 'INTERNAL_ERROR',
			internalDetails: {
				kind: 'postgres-operation-not-implemented',
				operation: 'create-many',
			},
		})

		driver.fail(Object.assign(new Error('secret'), { code: '23505' }))
		await expect(
			adapter.execute({
				accessConstraints: [],
				operation: {
					input: { title: 'Duplicate' },
					kind: 'create-one',
					schema: operation.query.schema,
				},
			}),
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
	})

	it('binds transaction operations to one borrowed client and releases after commit', async () => {
		const fixture = createFixture()
		const { adapter, driver: rootDriver, pool } = fixture
		const driver = getTransactionDriver(fixture)
		const transaction = await adapter.beginTransaction()
		const operation = {
			kind: 'find',
			query: new Query(articleSchema).select('id', 'title').ast,
		} satisfies FindOperationAst<
			typeof articleSchema,
			QueryFilterNode<typeof articleSchema>,
			'id' | 'title'
		>

		driver.respond([[firstId, 'Transactional']])
		await expect(
			transaction.execute({ accessConstraints: [], operation }),
		).resolves.toStrictEqual([{ id: firstId, title: 'Transactional' }])
		await transaction.commit()

		expect(pool.connectCalls).toBe(1)
		expect(rootDriver.calls).toStrictEqual([])
		expect(driver.transactionCalls).toStrictEqual(['BEGIN', 'COMMIT'])
		expect(driver.releaseCalls).toBe(1)
		expect(() =>
			transaction.execute({ accessConstraints: [], operation }),
		).toThrow(/no longer active/u)
		await expect(transaction.rollback()).rejects.toThrow(/no longer active/u)
	})

	it('prepares singular mutations with full private materializations', async () => {
		const fixture = createFixture()
		const driver = getTransactionDriver(fixture)
		const transaction = await fixture.adapter.beginTransaction()
		const createOperation: CreateOneOperationAst<typeof articleSchema> = {
			input: { title: 'Created' },
			kind: 'create-one',
			schema: new Query(articleSchema).ast.schema,
		}
		const preparedCreate = await transaction.prepare({
			accessConstraints: [],
			operation: createOperation,
		})

		// Create preparation has no physical target to resolve before execution.
		expect(driver.calls).toStrictEqual([])
		driver.respond([[null, 'Created', null, firstId, timestamp, timestamp]])
		await expect(preparedCreate.execute()).resolves.toStrictEqual({
			materializations: [
				{
					current: {
						createdAt: timestamp,
						id: firstId,
						title: 'Created',
						updatedAt: timestamp,
					},
					kind: 'create',
				},
			],
			result: {
				createdAt: timestamp,
				id: firstId,
				title: 'Created',
				updatedAt: timestamp,
			},
		})

		const query = new Query(articleSchema)
			.equalTo('title', 'Old')
			.select('id', 'title')
		const update = normalizeUpdateExpression(articleSchema, {
			set: { title: 'Updated' },
			increment: { views: 1 },
		})
		const updateOperation = {
			kind: 'update-one',
			query: query.ast,
			update,
		} satisfies UpdateOneOperationAst<typeof articleSchema, typeof update>
		const previous = {
			createdAt: timestamp,
			id: firstId,
			title: 'Old',
			updatedAt: timestamp,
			views: 1,
		}
		const current = {
			...previous,
			title: 'Updated',
			views: 2,
		}

		driver.respond([[null, 'Old', 1, firstId, timestamp, timestamp]])
		const preparedUpdate = await transaction.prepare({
			accessConstraints: [],
			operation: updateOperation,
		})

		expect(driver.calls.at(-1)?.text).toMatch(/for update/u)
		expect(preparedUpdate.target).toStrictEqual(previous)
		driver.respond([[null, 'Updated', 2, firstId, timestamp, timestamp]])
		const updateOutcome = await preparedUpdate.execute()

		expect(updateOutcome).toStrictEqual({
			materializations: [{ current, kind: 'update', previous }],
			result: { id: firstId, title: 'Updated' },
		})
		expect(Object.isFrozen(updateOutcome)).toBe(true)
		expect(Object.isFrozen(updateOutcome.materializations)).toBe(true)
		expect(Object.isFrozen(updateOutcome.materializations[0])).toBe(true)
		expect(Object.isFrozen(previous)).toBe(false)
		expect(Object.isFrozen(updateOutcome.materializations[0]?.previous)).toBe(
			true,
		)
		expect(Object.isFrozen(updateOutcome.materializations[0]?.current)).toBe(
			true,
		)
		expect(driver.calls.at(-1)?.params).toContain(firstId)
		expect(driver.calls.at(-1)?.text).not.toContain(' in (select ')
		await expect(preparedUpdate.execute()).rejects.toThrow(
			/already been executed/u,
		)

		const deleteOperation = {
			kind: 'delete-one',
			query: query.ast,
		} satisfies DeleteOneOperationAst<typeof articleSchema>

		driver.respond([[null, 'Updated', 2, firstId, timestamp, timestamp]])
		const preparedDelete = await transaction.prepare({
			accessConstraints: [],
			operation: deleteOperation,
		})

		expect(preparedDelete.target).toStrictEqual(current)
		driver.respond([[null, 'Updated', 2, firstId, timestamp, timestamp]])
		await expect(preparedDelete.execute()).resolves.toStrictEqual({
			materializations: [{ kind: 'delete', previous: current }],
			result: { id: firstId, title: 'Updated' },
		})
		expect(driver.calls.at(-1)?.params).toContain(firstId)
		expect(driver.calls.at(-1)?.text).not.toContain(' in (select ')

		await transaction.rollback()
	})

	it('keeps prepared handles transaction-bound and represents no match explicitly', async () => {
		const fixture = createFixture(2)
		const firstDriver = getTransactionDriver(fixture)
		const firstTransaction = await fixture.adapter.beginTransaction()
		const deleteOperation = {
			kind: 'delete-one',
			query: new Query(articleSchema).select('id').ast,
		} satisfies DeleteOneOperationAst<typeof articleSchema>

		firstDriver.respond([])
		const missing = await firstTransaction.prepare({
			accessConstraints: [],
			operation: deleteOperation,
		})

		expect(missing.target).toBeNull()
		await expect(missing.execute()).resolves.toStrictEqual({
			materializations: [],
			result: null,
		})

		const missingUpdateOperation = {
			kind: 'update-one',
			query: deleteOperation.query,
			update: normalizeUpdateExpression(articleSchema, {
				set: { title: 'Never written' },
			}),
		} satisfies UpdateOneOperationAst<typeof articleSchema>

		firstDriver.respond([])
		const missingUpdate = await firstTransaction.prepare({
			accessConstraints: [],
			operation: missingUpdateOperation,
		})
		const callCountBeforeExecution = firstDriver.calls.length

		expect(missingUpdate.target).toBeNull()
		await expect(missingUpdate.execute()).resolves.toStrictEqual({
			materializations: [],
			result: null,
		})
		expect(firstDriver.calls).toHaveLength(callCountBeforeExecution)
		await firstTransaction.rollback()

		const secondDriver = getTransactionDriver(fixture, 1)
		const secondTransaction = await fixture.adapter.beginTransaction()

		secondDriver.respond([
			[null, 'Delete later', 1, firstId, timestamp, timestamp],
		])
		const escaped = await secondTransaction.prepare({
			accessConstraints: [],
			operation: deleteOperation,
		})

		await secondTransaction.rollback()
		await expect(escaped.execute()).rejects.toMatchObject({
			code: 'TRANSACTION_ERROR',
			internalDetails: { kind: 'postgres-transaction-closed' },
		})
	})

	it('rolls back and releases one borrowed transaction client', async () => {
		const fixture = createFixture()
		const { adapter } = fixture
		const driver = getTransactionDriver(fixture)
		const transaction = await adapter.beginTransaction()

		await transaction.rollback()

		expect(driver.transactionCalls).toStrictEqual(['BEGIN', 'ROLLBACK'])
		expect(driver.releaseCalls).toBe(1)
		expect(driver.releaseArguments).toStrictEqual([undefined])
	})

	it('sanitizes lifecycle failures and never leaks a borrowed client', async () => {
		const beginFixture = createFixture()
		const beginDriver = getTransactionDriver(beginFixture)
		const beginSecret = 'begin-secret'

		beginDriver.failTransaction(
			'BEGIN',
			Object.assign(new Error(beginSecret), { code: '08006' }),
		)
		await expect(beginFixture.adapter.beginTransaction()).rejects.toMatchObject(
			{
				code: 'TRANSACTION_ERROR',
				cause: undefined,
				internalDetails: {
					driverCode: '08006',
					kind: 'postgres-transaction-failed',
					phase: 'begin',
				},
			},
		)
		expect(beginDriver.releaseCalls).toBe(1)
		expect(beginDriver.releaseArguments).toStrictEqual([true])

		const commitFixture = createFixture()
		const commitDriver = getTransactionDriver(commitFixture)
		const commitError = Object.assign(new Error('commit-secret'), {
			code: '40001',
		})

		const commitTransaction = await commitFixture.adapter.beginTransaction()

		commitDriver.failTransaction('COMMIT', commitError)
		await expect(commitTransaction.commit()).rejects.toMatchObject({
			code: 'TRANSACTION_ERROR',
			retryable: false,
			internalDetails: { phase: 'commit' },
		})
		expect(commitDriver.releaseCalls).toBe(0)
		expect(() =>
			commitTransaction.execute({
				accessConstraints: [],
				operation: {
					kind: 'find',
					query: new Query(articleSchema).ast,
				},
			}),
		).toThrow(/no longer active/u)
		await commitTransaction.rollback()
		expect(commitDriver.releaseCalls).toBe(1)

		const rollbackFixture = createFixture()
		const rollbackDriver = getTransactionDriver(rollbackFixture)

		const rollbackTransaction = await rollbackFixture.adapter.beginTransaction()

		rollbackDriver.failTransaction('ROLLBACK', new Error('rollback-secret'))
		await expect(rollbackTransaction.rollback()).rejects.toMatchObject({
			code: 'TRANSACTION_ERROR',
			cause: undefined,
			internalDetails: { phase: 'rollback' },
		})
		expect(rollbackDriver.releaseCalls).toBe(1)
		expect(rollbackDriver.releaseArguments).toStrictEqual([true])
	})

	it('rejects concurrent finalization without issuing duplicate statements', async () => {
		const commitFixture = createFixture()
		const commitDriver = getTransactionDriver(commitFixture)

		const commitTransaction = await commitFixture.adapter.beginTransaction()
		const firstCommit = commitTransaction.commit()
		const secondCommit = commitTransaction.commit()

		await expect(firstCommit).resolves.toBeUndefined()
		await expect(secondCommit).rejects.toMatchObject({
			code: 'TRANSACTION_ERROR',
			internalDetails: { kind: 'postgres-transaction-closed' },
		})
		expect(commitDriver.transactionCalls).toStrictEqual(['BEGIN', 'COMMIT'])
		expect(commitDriver.releaseCalls).toBe(1)
	})

	it('sanitizes pool acquisition failures before a client can leak', async () => {
		const secret = 'postgresql://user:password@private-host/database'
		const connectError = Object.assign(new Error(secret), { code: '08006' })
		const fixture = createFixture(0, connectError)
		let failure: unknown

		try {
			await fixture.adapter.beginTransaction()
		} catch (error: unknown) {
			failure = error
		}

		expect(failure).toMatchObject({
			code: 'TRANSACTION_ERROR',
			cause: undefined,
			retryable: true,
			internalDetails: {
				driverCode: '08006',
				phase: 'begin',
			},
		})
		expect(String(failure)).not.toContain(secret)
		expect(JSON.stringify(failure)).not.toContain(secret)
		expect(fixture.pool.connectCalls).toBe(1)
	})

	it('never reports a false rollback or false commit when custom release fails', async () => {
		const commitFixture = createFixture()
		const commitDriver = getTransactionDriver(commitFixture)

		const commitTransaction = await commitFixture.adapter.beginTransaction()

		commitDriver.failRelease(new Error('release after confirmed commit'))
		await expect(commitTransaction.commit()).resolves.toBeUndefined()
		expect(commitDriver.transactionCalls).toStrictEqual(['BEGIN', 'COMMIT'])

		const rollbackFixture = createFixture()
		const rollbackDriver = getTransactionDriver(rollbackFixture)

		const rollbackTransaction = await rollbackFixture.adapter.beginTransaction()

		rollbackDriver.failRelease(new Error('private release failure'))
		await expect(rollbackTransaction.rollback()).rejects.toMatchObject({
			code: 'TRANSACTION_ERROR',
			cause: undefined,
			internalDetails: { phase: 'rollback' },
		})
		expect(rollbackDriver.transactionCalls).toStrictEqual(['BEGIN', 'ROLLBACK'])
	})
})
