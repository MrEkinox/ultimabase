import {
	FrameworkError,
	QueryBuilder,
	Pointer,
	databaseConstraint,
	increment,
	normalizeUpdateExpression,
	type CreateOneOperationAst,
	type DeleteOneOperationAst,
	type FindManyOperationAst,
	type FindOneOperationAst,
	type QueryExpressionNode,
	type QueryFilterNode,
	type UpdateOneOperationAst,
	type UpsertOneOperationAst,
} from '@ultimabase/core'
import {
	Schema,
	SchemaRegistry,
	intField,
	pointerField,
	stringField,
} from '@ultimabase/core'
import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'
import {
	createRuntimeValidationStage,
	RequestContext,
	requestSources,
} from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { createPostgresDatabaseAdapter } from './adapter.js'
import type { PostgresDriverQueryClient } from './client.js'
import type { PostgresConstraintCompilerRegistry } from '../constraints/compiler.js'
import {
	postgresConstraintCompiler,
	type PostgresConstraintCompilerDefinition,
} from '../constraints/definition.js'
import type {
	PostgresPool,
	PostgresPoolClient,
} from '../connection/contracts.js'
import { PostgresSchemaCatalog } from '../schema/catalog.js'

const articleSchema = Schema.define({
	className: 'Article',
	fields: {
		note: stringField(),
		title: stringField({ validation: { required: true } }),
		views: intField(),
	},
})

const pointerUserSchema = Schema.define({
	className: 'AdapterPointerUser',
	fields: { name: stringField() },
})
const pointerPostSchema = Schema.define({
	className: 'AdapterPointerPost',
	fields: { author: pointerField({ target: () => pointerUserSchema }) },
})
const pointerRegistry = new SchemaRegistry([
	pointerUserSchema,
	pointerPostSchema,
])
const pointerCatalog = new PostgresSchemaCatalog(
	pointerRegistry.values(),
	pointerRegistry.resolveSchemaTargets(),
)

const decodeTenantPayload = (
	payload: unknown,
): { readonly tenantId: string } => {
	if (!isPlainRecord(payload) || typeof payload.tenantId !== 'string') {
		throw new TypeError('invalid tenant payload')
	}

	return { tenantId: payload.tenantId }
}

const tenantCompiler = postgresConstraintCompiler({
	kind: 'fixture.tenant',
	version: 1,
	decode: decodeTenantPayload,
	compile: ({ field, payload, sql }) =>
		sql`${field('note')} = ${payload.tenantId}`,
})
const visibilityCompiler = postgresConstraintCompiler({
	kind: 'fixture.visibility',
	version: 1,
	decode: (payload) => {
		if (typeof payload !== 'string') {
			throw new TypeError('invalid visibility payload')
		}

		return payload
	},
	compile: ({ field, payload, sql }) => sql`${field('title')} = ${payload}`,
})

/** Creates one live-looking read view without duplicating Core registry behavior. */
const createConstraintCompilerRegistry = (
	...definitions: readonly PostgresConstraintCompilerDefinition[]
): PostgresConstraintCompilerRegistry => {
	const contributions = definitions.map((definition) => ({
		definition,
		ownerPlugin: 'fixture.constraint-owner',
	}))

	return Object.freeze({ values: () => contributions })
}

interface RecordedDriverQuery {
	readonly params: readonly unknown[]
	readonly text: string
}

interface FixtureDriverResult {
	readonly rowCount: number
	readonly rows: readonly (readonly unknown[])[]
}

type TransactionStatement = 'BEGIN' | 'COMMIT' | 'ROLLBACK'

/** Emulates only node-postgres' query boundary while Drizzle builds and maps real SQL. */
class FixtureDriver implements PostgresDriverQueryClient, PostgresPoolClient {
	readonly #responses: (Error | FixtureDriverResult)[] = []
	readonly #transactionFailures = new Map<TransactionStatement, Error>()
	readonly calls: RecordedDriverQuery[] = []
	readonly savepointCalls: string[] = []
	readonly transactionCalls: TransactionStatement[] = []
	readonly releaseArguments: (Error | boolean | undefined)[] = []
	releaseCalls = 0
	#releaseFailure: Error | undefined

	respond(rows: readonly (readonly unknown[])[], rowCount = rows.length): void {
		this.#responses.push({ rowCount, rows })
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
				? Promise.resolve({ rowCount: 0, rows: [] })
				: Promise.reject(failure)
		}

		if (
			typeof configuration === 'string' &&
			(configuration.startsWith('SAVEPOINT ') ||
				configuration.startsWith('ROLLBACK TO SAVEPOINT ') ||
				configuration.startsWith('RELEASE SAVEPOINT '))
		) {
			this.savepointCalls.push(configuration)

			return Promise.resolve({ rowCount: 0, rows: [] })
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

const createFixture = (
	transactionCount = 1,
	connectError?: Error,
	constraintCompilers?: PostgresConstraintCompilerRegistry,
) => {
	const driver = new FixtureDriver()
	const transactionDrivers = Array.from(
		{ length: transactionCount },
		() => new FixtureDriver(),
	)
	const pool = new FixturePool(driver, transactionDrivers, connectError)
	const adapter = createPostgresDatabaseAdapter(
		pool,
		new PostgresSchemaCatalog([articleSchema]),
		constraintCompilers,
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

/** Matches the compiled Article column order used by fixture RETURNING clauses. */
const articleRow = (
	note: string | null,
	title: string,
	views: number,
	id: string,
): readonly unknown[] => [note, title, views, id, timestamp, timestamp]

describe('internal PostgreSQL database adapter', () => {
	it('executes pointer create and predicate boundaries as UUID parameters', async () => {
		const driver = new FixtureDriver()
		const pool = new FixturePool(driver, [])
		const adapter = createPostgresDatabaseAdapter(pool, pointerCatalog)
		const author = pointerUserSchema.pointer(secondId)
		const validation = createRuntimeValidationStage({
			clock: () => new Date(timestamp),
			uuidV7Generator: () => firstId,
		})
		const create: CreateOneOperationAst<typeof pointerPostSchema> = {
			input: { author },
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(pointerPostSchema).ast.schema,
		}
		const normalized = await validation({
			context: RequestContext.anonymous({
				requestId: 'postgres-pointer-create-fixture',
				source: requestSources.internal,
			}),
			operation: create,
		})

		driver.respond([[secondId, firstId, timestamp, timestamp]])
		const created = await adapter.execute({
			constraints: [],
			operation: normalized,
		})

		expect(Pointer.is(created.author)).toBe(true)
		expect(author.equals(created.author)).toBe(true)
		expect(driver.calls[0]?.params).toContain(secondId)

		const query = new QueryBuilder(pointerPostSchema).where((where) =>
			where.eq('author', author),
		)

		driver.respond([[secondId, firstId, timestamp, timestamp]])
		const [found] = await adapter.execute({
			constraints: [],
			operation: { kind: 'find-many', query: query.ast },
		})

		expect(found).toBeDefined()
		expect(author.equals(found?.author)).toBe(true)
		expect(driver.calls[1]?.params).toContain(secondId)
		expect(driver.calls[1]?.text).not.toContain(secondId)
	})

	it('executes every singular read contract through parameterized Drizzle SQL', async () => {
		const { adapter, driver } = createFixture()
		const query = new QueryBuilder(articleSchema)
			.where((where) => where.gt('views', 10))
			.select({ id: true, title: true })
			.descending('views')
			.limit(2)
		const find = {
			kind: 'find-many',
			query: query.ast,
		} satisfies FindManyOperationAst<
			typeof articleSchema,
			QueryFilterNode<typeof articleSchema>,
			'id' | 'title'
		>

		driver.respond([
			[firstId, 'First'],
			[secondId, 'Second'],
		])
		await expect(
			adapter.execute({ constraints: [], operation: find }),
		).resolves.toStrictEqual([
			{ id: firstId, title: 'First' },
			{ id: secondId, title: 'Second' },
		])
		expect(driver.calls.at(-1)).toMatchObject({
			params: [10, 2],
		})
		expect(driver.calls.at(-1)?.text).toMatch(
			/select .* from "articles" as "[^"]+" where .* > \$1 order by .* desc nulls last limit \$2/u,
		)

		const titleOnly = {
			kind: 'find-many',
			query: new QueryBuilder(articleSchema).select({ title: true }).ast,
		} satisfies FindManyOperationAst<
			typeof articleSchema,
			QueryFilterNode<typeof articleSchema>,
			'title'
		>

		driver.respond([['Private identity', firstId]])
		const projected = await adapter.execute({
			constraints: [],
			operation: titleOnly,
		})

		expect(projected).toStrictEqual([{ title: 'Private identity' }])
		const projectedRecord = projected[0]

		if (projectedRecord === undefined) {
			throw new TypeError('PostgreSQL projection fixture returned no record')
		}

		expect(adapter.readObjectIdentity?.(projectedRecord)).toBe(firstId)

		const withoutNote = new QueryBuilder(articleSchema).select({ note: false })

		driver.respond([['Public article', 3, firstId, timestamp, timestamp]])
		await expect(
			adapter.execute({
				constraints: [],
				operation: { kind: 'find-many', query: withoutNote.ast },
			}),
		).resolves.toStrictEqual([
			{
				createdAt: timestamp,
				id: firstId,
				title: 'Public article',
				updatedAt: timestamp,
				views: 3,
			},
		])

		driver.respond([])
		await expect(
			adapter.execute({
				constraints: [],
				operation: { kind: 'find-one', query: query.ast },
			}),
		).resolves.toBeNull()

		driver.respond([])
		await expect(
			adapter.execute({
				constraints: [],
				operation: { kind: 'get', query: query.ast, id: firstId },
			}),
		).resolves.toBeNull()
		expect(driver.calls.at(-1)?.params).toContain(firstId)

		driver.respond([[2]])
		await expect(
			adapter.execute({
				constraints: [],
				operation: { kind: 'count', query: query.ast },
			}),
		).resolves.toBe(2)
		expect(driver.calls.at(-1)?.text).toContain('ultimabase_count_target')

		driver.respond([[firstId]])
		await expect(
			adapter.execute({
				constraints: [],
				operation: { kind: 'exists', query: query.ast },
			}),
		).resolves.toBe(true)
	})

	it('combines registered constraints with query predicates using parameterized AND', async () => {
		const compilerRegistry = createConstraintCompilerRegistry(
			tenantCompiler,
			visibilityCompiler,
		)
		const { adapter, driver } = createFixture(1, undefined, compilerRegistry)
		const injectedTenant = "tenant' OR true --"
		const operation = {
			kind: 'find-many',
			query: new QueryBuilder(articleSchema).where((where) =>
				where.gt('views', 10),
			).ast,
		} satisfies FindManyOperationAst<typeof articleSchema>
		const rowFilter = new QueryBuilder(articleSchema).where((where) =>
			where.eq('note', 'Access-visible'),
		).ast.where?.expression

		if (rowFilter === undefined) {
			throw new TypeError('Access row-filter fixture requires an expression')
		}

		driver.respond([])
		await adapter.execute({
			constraints: [
				databaseConstraint('fixture.tenant', 1, {
					tenantId: injectedTenant,
				}),
				databaseConstraint('fixture.visibility', 1, 'Visible'),
			],
			operation,
			rowFilter,
		})

		const call = driver.calls[0]

		expect(call?.params).toStrictEqual([
			10,
			injectedTenant,
			'Visible',
			'Access-visible',
		])
		// Redundant parentheses are a Drizzle rendering detail; every predicate is conjunctive here.
		const queryText = call?.text.replaceAll(/[()]/gu, '')
		const tableAlias = /from "articles" as "([^"]+)"/u.exec(
			queryText ?? '',
		)?.[1]

		if (tableAlias === undefined) {
			throw new TypeError('Relational query fixture requires a table alias')
		}

		expect(queryText).toContain(
			`where "${tableAlias}"."views" > $1 and "${tableAlias}"."note" = $2 and "${tableAlias}"."title" = $3 and "${tableAlias}"."note" = $4`,
		)
		expect(call?.text).not.toContain(injectedTenant)
	})

	it('projects direct create results after persisting complete Runtime values', async () => {
		const { adapter, driver } = createFixture()
		const validation = createRuntimeValidationStage({
			clock: () => new Date(timestamp),
			uuidV7Generator: () => firstId,
		})
		const operation: CreateOneOperationAst<
			typeof articleSchema,
			'id' | 'title'
		> = {
			input: { title: 'Created' },
			kind: 'create-one',
			selection: {
				fields: [
					{ field: 'id', kind: 'selected-field' },
					{ field: 'title', kind: 'selected-field' },
				],
				kind: 'selection',
			},
			schema: new QueryBuilder(articleSchema).ast.schema,
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
			adapter.execute({ constraints: [], operation: normalized }),
		).resolves.toStrictEqual({
			id: firstId,
			title: 'Created',
		})
		expect(driver.calls[0]?.params).toStrictEqual([
			null,
			'Created',
			null,
			firstId,
			timestamp,
			timestamp,
		])
	})

	it('updates and deletes the deterministic first match through an id subquery', async () => {
		const { adapter, driver } = createFixture()
		const query = new QueryBuilder(articleSchema)
			.where((where) => where.eq('title', 'Old'))
			.select({ id: true, title: true })
			.descending('views')
		const update = normalizeUpdateExpression(articleSchema, {
			title: 'Requested',
			views: increment(1),
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
			adapter.execute({ constraints: [], operation: updateOperation }),
		).resolves.toStrictEqual({ id: firstId, title: 'Updated' })
		expect(driver.calls.at(-1)?.text).toMatch(
			/update "articles" set .* where "articles"\."id" in \(select/u,
		)

		driver.respond([[firstId, 'Updated']])
		await expect(
			adapter.execute({ constraints: [], operation: deleteOperation }),
		).resolves.toStrictEqual({ id: firstId, title: 'Updated' })
		expect(driver.calls.at(-1)?.text).toMatch(
			/delete from "articles" where "articles"\."id" in \(select/u,
		)

		driver.respond([])
		await expect(
			adapter.execute({ constraints: [], operation: updateOperation }),
		).resolves.toBeNull()
	})

	it('fails closed for unsupported constraints, root upserts, and driver errors', async () => {
		const { adapter, driver } = createFixture()
		const operation = {
			kind: 'find-many',
			query: new QueryBuilder(articleSchema).ast,
		} satisfies FindManyOperationAst<typeof articleSchema>

		await expect(
			adapter.execute({
				constraints: [
					databaseConstraint('fixture.future-row', 1, {
						tenantId: 'tenant-1',
					}),
				],
				operation,
			}),
		).rejects.toMatchObject({
			code: 'INTERNAL_ERROR',
			internalDetails: {
				kind: 'postgres-constraint-compilation-failed',
				reason: 'compiler-missing',
			},
		})
		expect(driver.calls).toStrictEqual([])

		await expect(
			adapter.execute({
				constraints: [],
				operation: {
					create: { title: 'Pending' },
					kind: 'upsert-one',
					query: new QueryBuilder(articleSchema).where((where) =>
						where.eq('id', firstId),
					).ast,
					target: { fields: ['id'], kind: 'unique-upsert-target' },
					update: normalizeUpdateExpression(articleSchema, {
						title: 'Pending',
					}),
				},
			}),
		).rejects.toMatchObject({
			code: 'INTERNAL_ERROR',
			internalDetails: {
				kind: 'postgres-operation-not-implemented',
				operation: 'upsert-one',
			},
		})

		driver.fail(Object.assign(new Error('secret'), { code: '23505' }))
		await expect(
			adapter.execute({
				constraints: [],
				operation: {
					input: { title: 'Duplicate' },
					kind: 'create-one',
					selection: { fields: [], kind: 'selection' },
					schema: operation.query.schema,
				},
			}),
		).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
	})

	it('sanitizes eager pointer query failures through the shared operation boundary', async () => {
		const driver = new FixtureDriver()
		const pool = new FixturePool(driver, [])
		const adapter = createPostgresDatabaseAdapter(pool, pointerCatalog)
		const query = new QueryBuilder(pointerPostSchema).include(
			'author',
			(author) => author.select({ name: true }),
		)
		const inclusion = query.ast.inclusion.fields[0]

		if (inclusion === undefined) {
			throw new TypeError('Eager pointer fixture requires one inclusion')
		}
		const targetOperation: FindOneOperationAst<
			typeof pointerUserSchema,
			QueryExpressionNode,
			'name'
		> = {
			kind: 'find-one',
			query: inclusion.query,
		}

		const secret = 'select private_value from internal_table'

		driver.fail(Object.assign(new Error(secret), { code: '08006' }))
		const failure: unknown = await adapter
			.execute({
				constraints: [],
				operation: { kind: 'find-many', query: query.ast },
				inclusions: [
					{
						fieldPath: ['author'],
						kind: 'pointer',
						request: {
							constraints: [],
							operation: targetOperation,
						},
					},
				],
			})
			.catch((error: unknown) => error)

		expect(failure).toBeInstanceOf(FrameworkError)

		if (!(failure instanceof FrameworkError)) {
			throw new TypeError('Expected a sanitized framework error')
		}

		expect(failure).toMatchObject({
			code: 'INTERNAL_ERROR',
			internalDetails: { driverCode: '08006', operation: 'find-many' },
		})
		expect(failure.toJSON()).toStrictEqual({
			code: 'INTERNAL_ERROR',
			message: 'The database operation failed.',
			retryable: false,
		})
		expect(String(failure)).not.toContain(secret)
		expect(JSON.stringify(failure.toJSON())).not.toContain(secret)
	})

	it('fails before SQL for unsupported versions, invalid payloads, outputs, and creates', async () => {
		const invalidOutputCompiler = postgresConstraintCompiler({
			kind: 'fixture.invalid-output',
			version: 1,
			decode: (payload) => payload,
			compile: () => ({}) as never,
		})
		const { adapter, driver } = createFixture(
			1,
			undefined,
			createConstraintCompilerRegistry(tenantCompiler, invalidOutputCompiler),
		)
		const query = new QueryBuilder(articleSchema).ast
		const operation = {
			kind: 'find-many',
			query,
		} satisfies FindManyOperationAst<typeof articleSchema>
		const invalidCases = [
			{
				constraint: databaseConstraint('fixture.tenant', 2, {
					tenantId: 'tenant-1',
				}),
				reason: 'version-unsupported',
			},
			{
				constraint: databaseConstraint('fixture.tenant', 1, null),
				reason: 'compiler-failed',
			},
			{
				constraint: databaseConstraint('fixture.invalid-output', 1, null),
				reason: 'compiler-failed',
			},
		] as const

		for (const invalidCase of invalidCases) {
			await expect(
				adapter.execute({
					constraints: [invalidCase.constraint],
					operation,
				}),
			).rejects.toMatchObject({
				code: 'INTERNAL_ERROR',
				internalDetails: {
					kind: 'postgres-constraint-compilation-failed',
					reason: invalidCase.reason,
				},
			})
		}

		await expect(
			adapter.execute({
				constraints: [
					databaseConstraint('fixture.tenant', 1, {
						tenantId: 'tenant-1',
					}),
				],
				operation: {
					input: { title: 'Never inserted' },
					kind: 'create-one',
					selection: { fields: [], kind: 'selection' },
					schema: query.schema,
				},
			}),
		).rejects.toMatchObject({
			code: 'INTERNAL_ERROR',
			internalDetails: {
				kind: 'postgres-constraint-operation-unsupported',
				operation: 'create-one',
			},
		})
		const rowFilter = new QueryBuilder(articleSchema).where((where) =>
			where.eq('title', 'visible'),
		).ast.where?.expression

		if (rowFilter === undefined) {
			throw new TypeError('Create row-filter fixture requires an expression')
		}

		await expect(
			adapter.execute({
				constraints: [],
				operation: {
					input: { title: 'Never inserted by Access' },
					kind: 'create-one',
					selection: { fields: [], kind: 'selection' },
					schema: query.schema,
				},
				rowFilter,
			}),
		).rejects.toMatchObject({
			code: 'INTERNAL_ERROR',
			internalDetails: {
				kind: 'postgres-constraint-operation-unsupported',
				operation: 'create-one',
			},
		})
		expect(driver.calls).toStrictEqual([])
	})

	it('binds transaction operations to one borrowed client and releases after commit', async () => {
		const fixture = createFixture()
		const { adapter, driver: rootDriver, pool } = fixture
		const driver = getTransactionDriver(fixture)
		const transaction = await adapter.beginTransaction()
		const operation = {
			kind: 'find-many',
			query: new QueryBuilder(articleSchema).select({ id: true, title: true })
				.ast,
		} satisfies FindManyOperationAst<
			typeof articleSchema,
			QueryFilterNode<typeof articleSchema>,
			'id' | 'title'
		>

		driver.respond([[firstId, 'Transactional']])
		await expect(
			transaction.execute({ constraints: [], operation }),
		).resolves.toStrictEqual([{ id: firstId, title: 'Transactional' }])
		await transaction.commit()

		expect(pool.connectCalls).toBe(1)
		expect(rootDriver.calls).toStrictEqual([])
		expect(driver.transactionCalls).toStrictEqual(['BEGIN', 'COMMIT'])
		expect(driver.releaseCalls).toBe(1)
		expect(() => transaction.execute({ constraints: [], operation })).toThrow(
			/no longer active/u,
		)
		await expect(transaction.rollback()).rejects.toThrow(/no longer active/u)
	})

	it('prepares singular mutations with full private materializations', async () => {
		const fixture = createFixture()
		const driver = getTransactionDriver(fixture)
		const transaction = await fixture.adapter.beginTransaction()
		const createOperation: CreateOneOperationAst<
			typeof articleSchema,
			'id' | 'title'
		> = {
			input: { title: 'Created' },
			kind: 'create-one',
			selection: {
				fields: [
					{ field: 'id', kind: 'selected-field' },
					{ field: 'title', kind: 'selected-field' },
				],
				kind: 'selection',
			},
			schema: new QueryBuilder(articleSchema).ast.schema,
		}
		const preparedCreate = await transaction.prepare({
			constraints: [],
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
						note: null,
						title: 'Created',
						updatedAt: timestamp,
						views: null,
					},
					kind: 'create',
				},
			],
			result: {
				id: firstId,
				title: 'Created',
			},
		})

		const query = new QueryBuilder(articleSchema)
			.where((where) => where.eq('title', 'Old'))
			.select({ id: true, title: true })
		const update = normalizeUpdateExpression(articleSchema, {
			title: 'Updated',
			views: increment(1),
		})
		const updateOperation = {
			kind: 'update-one',
			query: query.ast,
			update,
		} satisfies UpdateOneOperationAst<typeof articleSchema, typeof update>
		const previous = {
			createdAt: timestamp,
			id: firstId,
			note: null,
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
			constraints: [],
			operation: updateOperation,
		})

		expect(driver.calls.at(-1)?.text).toMatch(/for update/u)
		expect(preparedUpdate.target).toStrictEqual(previous)
		const resolvedUpdateOperation = {
			...updateOperation,
			update: normalizeUpdateExpression(articleSchema, {
				title: 'Updated',
				views: increment(1),
			}),
		}
		driver.respond([[null, 'Updated', 2, firstId, timestamp, timestamp]])
		const updateOutcome = await preparedUpdate.execute(resolvedUpdateOperation)

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
		expect(driver.calls.at(-1)?.params).toContain('Updated')
		expect(driver.calls.at(-1)?.params).not.toContain('Requested')
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
			constraints: [],
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

	it('creates atomic collections in one statement and restores input order by id', async () => {
		const fixture = createFixture()
		const driver = getTransactionDriver(fixture)
		const transaction = await fixture.adapter.beginTransaction()
		const first = {
			createdAt: timestamp,
			id: firstId,
			note: null,
			title: 'First',
			updatedAt: timestamp,
			views: 1,
		}
		const second = {
			createdAt: timestamp,
			id: secondId,
			note: null,
			title: 'Second',
			updatedAt: timestamp,
			views: 2,
		}
		const prepared = await transaction.prepare({
			constraints: [],
			operation: {
				inputs: [first, second],
				kind: 'create-many',
				options: { atomic: true },
				selection: new QueryBuilder(articleSchema).select({
					id: true,
					title: true,
				}).ast.selection,
				schema: new QueryBuilder(articleSchema).ast.schema,
			},
		})

		// PostgreSQL does not promise RETURNING order, so the fixture reverses it.
		driver.respond([
			articleRow(null, 'Second', 2, secondId),
			articleRow(null, 'First', 1, firstId),
		])
		await expect(prepared.execute()).resolves.toStrictEqual({
			materializations: [
				{ current: first, kind: 'create' },
				{ current: second, kind: 'create' },
			],
			result: [
				{ id: firstId, title: 'First' },
				{ id: secondId, title: 'Second' },
			],
		})
		expect(driver.calls).toHaveLength(1)
		expect(driver.calls[0]?.text).toMatch(/insert into "articles"/u)

		const empty = await transaction.prepare({
			constraints: [],
			operation: {
				inputs: [],
				kind: 'create-many',
				options: { atomic: true },
				selection: new QueryBuilder(articleSchema).ast.selection,
				schema: new QueryBuilder(articleSchema).ast.schema,
			},
		})
		await expect(empty.execute()).resolves.toStrictEqual({
			materializations: [],
			result: [],
		})
		expect(driver.calls).toHaveLength(1)
		await transaction.rollback()
	})

	it('returns a recovered non-atomic prefix and never attempts later inputs', async () => {
		const fixture = createFixture()
		const driver = getTransactionDriver(fixture)
		const transaction = await fixture.adapter.beginTransaction()
		const first = {
			createdAt: timestamp,
			id: firstId,
			title: 'First',
			updatedAt: timestamp,
			views: 1,
		}
		const prepared = await transaction.prepare({
			constraints: [],
			operation: {
				inputs: [
					first,
					{ ...first, id: secondId, title: 'Duplicate' },
					{ ...first, id: '0198c3d4-1000-7000-8000-000000000003' },
				],
				kind: 'create-many',
				options: { atomic: false },
				selection: new QueryBuilder(articleSchema).select({
					id: true,
					title: true,
				}).ast.selection,
				schema: new QueryBuilder(articleSchema).ast.schema,
			},
		})

		driver.respond([articleRow(null, 'First', 1, firstId)])
		driver.fail(
			Object.assign(new Error('private unique detail'), { code: '23505' }),
		)
		const outcome = await prepared.execute()

		expect(outcome).toMatchObject({
			materializations: [{ current: first, kind: 'create' }],
			result: {
				failedIndex: 1,
				results: [{ id: firstId, title: 'First' }],
				status: 'stopped',
			},
		})
		expect(outcome.result).toMatchObject({
			error: { code: 'VALIDATION_ERROR' },
		})
		expect(driver.calls).toHaveLength(2)
		expect(driver.savepointCalls).toStrictEqual([
			'SAVEPOINT ultimabase_bulk_0',
			'RELEASE SAVEPOINT ultimabase_bulk_0',
			'SAVEPOINT ultimabase_bulk_1',
			'ROLLBACK TO SAVEPOINT ultimabase_bulk_1',
			'RELEASE SAVEPOINT ultimabase_bulk_1',
		])
		await transaction.commit()
	})

	it('executes set-based update and delete once without materializations', async () => {
		const fixture = createFixture()
		const driver = getTransactionDriver(fixture)
		const transaction = await fixture.adapter.beginTransaction()
		const query = new QueryBuilder(articleSchema)
			.where((where) => where.gt('views', 0))
			.select({ id: true, title: true })
			.limit(10)
		const update = normalizeUpdateExpression(articleSchema, {
			views: increment(1),
		})
		const preparedUpdate = await transaction.prepare({
			constraints: [],
			operation: { kind: 'update-many', query: query.ast, update },
		})

		driver.respond([
			[firstId, 'First updated'],
			[secondId, 'Second updated'],
		])
		await expect(preparedUpdate.execute()).resolves.toStrictEqual({
			materializations: [],
			result: [
				{ id: firstId, title: 'First updated' },
				{ id: secondId, title: 'Second updated' },
			],
		})
		expect(driver.calls).toHaveLength(1)
		expect(driver.calls[0]?.text).toMatch(
			/update "articles" set .* returning "id", "title"/u,
		)

		const preparedDelete = await transaction.prepare({
			constraints: [],
			operation: { kind: 'delete-many', query: query.ast },
		})
		driver.respond([
			[firstId, 'First updated'],
			[secondId, 'Second updated'],
		])
		await expect(preparedDelete.execute()).resolves.toStrictEqual({
			materializations: [],
			result: [
				{ id: firstId, title: 'First updated' },
				{ id: secondId, title: 'Second updated' },
			],
		})
		expect(driver.calls).toHaveLength(2)
		expect(driver.calls[1]?.text).toMatch(
			/delete from "articles".* returning "id", "title"/u,
		)
		await transaction.rollback()
	})

	it('reports exact create and update branches for selection-aware upserts', async () => {
		const fixture = createFixture()
		const driver = getTransactionDriver(fixture)
		const transaction = await fixture.adapter.beginTransaction()
		const create = {
			createdAt: timestamp,
			id: firstId,
			note: null,
			title: 'Created',
			updatedAt: timestamp,
			views: 0,
		}
		const query = new QueryBuilder(articleSchema)
			.where((where) => where.eq('id', firstId))
			.select({ id: true, title: true })
		const update = normalizeUpdateExpression(articleSchema, {
			title: 'Updated',
		})
		const operation = {
			create,
			kind: 'upsert-one' as const,
			query: query.ast,
			target: {
				fields: ['id'] as const,
				kind: 'unique-upsert-target' as const,
			},
			update,
		}

		driver.respond([])
		driver.respond([articleRow(null, 'Created', 0, firstId)])
		const preparedCreate = await transaction.prepare({
			constraints: [],
			operation,
		})
		await expect(preparedCreate.execute()).resolves.toStrictEqual({
			materializations: [{ current: create, kind: 'create' }],
			result: { id: firstId, title: 'Created' },
		})

		const current = { ...create, title: 'Updated' }
		driver.respond([articleRow(null, 'Created', 0, firstId)])
		driver.respond([articleRow(null, 'Updated', 0, firstId)])
		const preparedUpdate = await transaction.prepare({
			constraints: [],
			operation,
		})
		await expect(preparedUpdate.execute()).resolves.toStrictEqual({
			materializations: [{ current, kind: 'update', previous: create }],
			result: { id: firstId, title: 'Updated' },
		})
		await transaction.rollback()
	})

	it('preserves ordered create and update materializations for atomic upsert-many', async () => {
		const fixture = createFixture()
		const driver = getTransactionDriver(fixture)
		const transaction = await fixture.adapter.beginTransaction()
		const first = {
			createdAt: timestamp,
			id: firstId,
			note: null,
			title: 'First created',
			updatedAt: timestamp,
			views: 0,
		}
		const secondPrevious = {
			createdAt: timestamp,
			id: secondId,
			note: null,
			title: 'Second previous',
			updatedAt: timestamp,
			views: 1,
		}
		const secondCurrent = { ...secondPrevious, title: 'Second updated' }
		const update = normalizeUpdateExpression(articleSchema, {
			title: 'Second updated',
		})
		const item = (id: string, create: typeof first) => ({
			create,
			query: new QueryBuilder(articleSchema).where((where) =>
				where.eq('id', id),
			).ast,
			target: {
				fields: ['id'] as const,
				kind: 'unique-upsert-target' as const,
			},
			update,
		})
		const prepared = await transaction.prepare({
			constraints: [],
			operation: {
				items: [
					item(firstId, first),
					item(secondId, { ...first, id: secondId }),
				],
				kind: 'upsert-many',
				options: { atomic: true },
				selection: new QueryBuilder(articleSchema).select({
					id: true,
					title: true,
				}).ast.selection,
				schema: new QueryBuilder(articleSchema).ast.schema,
			},
		})

		driver.respond([])
		driver.respond([articleRow(null, 'First created', 0, firstId)])
		driver.respond([articleRow(null, 'Second previous', 1, secondId)])
		driver.respond([articleRow(null, 'Second updated', 1, secondId)])
		await expect(prepared.execute()).resolves.toStrictEqual({
			materializations: [
				{ current: first, kind: 'create' },
				{
					current: secondCurrent,
					kind: 'update',
					previous: secondPrevious,
				},
			],
			result: [
				{ id: firstId, title: 'First created' },
				{ id: secondId, title: 'Second updated' },
			],
		})
		expect(driver.savepointCalls).toStrictEqual([])
		await transaction.rollback()
	})

	it('stops non-atomic upsert-many after recovering its first failed item', async () => {
		const fixture = createFixture()
		const driver = getTransactionDriver(fixture)
		const transaction = await fixture.adapter.beginTransaction()
		const first = {
			createdAt: timestamp,
			id: firstId,
			title: 'First',
			updatedAt: timestamp,
			views: 0,
		}
		const update = normalizeUpdateExpression(articleSchema, {
			title: 'Updated',
		})
		const item = (id: string) => ({
			create: { ...first, id },
			query: new QueryBuilder(articleSchema).where((where) =>
				where.eq('id', id),
			).ast,
			target: {
				fields: ['id'] as const,
				kind: 'unique-upsert-target' as const,
			},
			update,
		})
		const prepared = await transaction.prepare({
			constraints: [],
			operation: {
				items: [
					item(firstId),
					item(secondId),
					item('0198c3d4-1000-7000-8000-000000000003'),
				],
				kind: 'upsert-many',
				options: { atomic: false },
				selection: new QueryBuilder(articleSchema).select({
					id: true,
					title: true,
				}).ast.selection,
				schema: new QueryBuilder(articleSchema).ast.schema,
			},
		})

		driver.respond([])
		driver.respond([articleRow(null, 'First', 0, firstId)])
		driver.fail(
			Object.assign(new Error('private connection detail'), { code: '08006' }),
		)
		const outcome = await prepared.execute()

		expect(outcome).toMatchObject({
			materializations: [{ current: first, kind: 'create' }],
			result: {
				failedIndex: 1,
				results: [{ id: firstId, title: 'First' }],
				status: 'stopped',
			},
		})
		expect(driver.calls).toHaveLength(3)
		expect(driver.savepointCalls).toStrictEqual([
			'SAVEPOINT ultimabase_bulk_0',
			'RELEASE SAVEPOINT ultimabase_bulk_0',
			'SAVEPOINT ultimabase_bulk_1',
			'ROLLBACK TO SAVEPOINT ultimabase_bulk_1',
			'RELEASE SAVEPOINT ultimabase_bulk_1',
		])
		await transaction.commit()
	})

	it('reapplies constraints to prepared locks and final update or delete writes', async () => {
		const fixture = createFixture(
			1,
			undefined,
			createConstraintCompilerRegistry(tenantCompiler),
		)
		const driver = getTransactionDriver(fixture)
		const transaction = await fixture.adapter.beginTransaction()
		const constraints = [
			databaseConstraint('fixture.tenant', 1, { tenantId: 'tenant-1' }),
		]
		const query = new QueryBuilder(articleSchema).where((where) =>
			where.eq('title', 'Old'),
		).ast
		const updateOperation = {
			kind: 'update-one',
			query,
			update: normalizeUpdateExpression(articleSchema, {
				title: 'Updated',
			}),
		} satisfies UpdateOneOperationAst<typeof articleSchema>

		driver.respond([['tenant-1', 'Old', 1, firstId, timestamp, timestamp]])
		const preparedUpdate = await transaction.prepare({
			constraints,
			operation: updateOperation,
		})
		const lockCall = driver.calls.at(-1)

		expect(lockCall?.text).toMatch(/where .* and .*note.*for update/u)
		expect(lockCall?.params).toContain('tenant-1')

		driver.respond([['tenant-1', 'Updated', 1, firstId, timestamp, timestamp]])
		await preparedUpdate.execute()
		const updateCall = driver.calls.at(-1)

		expect(updateCall?.text).toMatch(/update .* where \(.*id.* and .*note/u)
		expect(updateCall?.params).toContain(firstId)
		expect(updateCall?.params).toContain('tenant-1')

		const deleteOperation = {
			kind: 'delete-one',
			query: new QueryBuilder(articleSchema).where((where) =>
				where.eq('title', 'Updated'),
			).ast,
		} satisfies DeleteOneOperationAst<typeof articleSchema>

		driver.respond([['tenant-1', 'Updated', 1, firstId, timestamp, timestamp]])
		const preparedDelete = await transaction.prepare({
			constraints,
			operation: deleteOperation,
		})

		expect(driver.calls.at(-1)?.text).toMatch(
			/where .* and .*note.*for update/u,
		)
		driver.respond([['tenant-1', 'Updated', 1, firstId, timestamp, timestamp]])
		await preparedDelete.execute()
		const deleteCall = driver.calls.at(-1)

		expect(deleteCall?.text).toMatch(/delete .* where \(.*id.* and .*note/u)
		expect(deleteCall?.params).toContain(firstId)
		expect(deleteCall?.params).toContain('tenant-1')

		const preparedMany = await transaction.prepare({
			constraints,
			operation: {
				kind: 'update-many',
				query: new QueryBuilder(articleSchema)
					.where((where) => where.eq('title', 'Old'))
					.select({ id: true }).ast,
				update: updateOperation.update,
			},
		})
		driver.respond([[firstId]])
		await expect(preparedMany.execute()).resolves.toMatchObject({
			result: [{ id: firstId }],
		})
		const manyCall = driver.calls.at(-1)

		expect(manyCall?.text).toMatch(
			/update .*where \(.*id.*select.*note.* and .*note/u,
		)
		expect(
			manyCall?.params.filter((value) => value === 'tenant-1'),
		).toHaveLength(2)

		const upsertCreate = {
			createdAt: timestamp,
			id: firstId,
			note: 'tenant-1',
			title: 'Created candidate',
			updatedAt: timestamp,
			views: 0,
		}
		const upsertOperation = {
			create: upsertCreate,
			kind: 'upsert-one',
			query: new QueryBuilder(articleSchema).where((where) =>
				where.eq('id', firstId),
			).ast,
			target: {
				fields: ['id'],
				kind: 'unique-upsert-target',
			},
			update: normalizeUpdateExpression(articleSchema, {
				title: 'Upsert updated',
			}),
		} as const satisfies UpsertOneOperationAst<typeof articleSchema>
		const preparedUpsert = await transaction.prepare({
			constraints,
			operation: upsertOperation,
		})
		const upsertCallOffset = driver.calls.length

		// The empty insert models a concurrent winner between the two target locks.
		driver.respond([])
		driver.respond([])
		driver.respond([articleRow('tenant-1', 'Concurrent winner', 1, firstId)])
		driver.respond([articleRow('tenant-1', 'Upsert updated', 1, firstId)])
		await preparedUpsert.execute()

		const firstUpsertLock = driver.calls[upsertCallOffset]
		const secondUpsertLock = driver.calls[upsertCallOffset + 2]
		const upsertUpdate = driver.calls[upsertCallOffset + 3]

		for (const lockCall of [firstUpsertLock, secondUpsertLock]) {
			expect(lockCall?.text).toMatch(/where .* and .*note.*for update/u)
			expect(lockCall?.params).toContain('tenant-1')
		}
		expect(upsertUpdate?.text).toMatch(/update .*where \(.*id.* and .*note/u)
		expect(upsertUpdate?.params).toContain('tenant-1')
		await transaction.rollback()
	})

	it('keeps prepared handles transaction-bound and represents no match explicitly', async () => {
		const fixture = createFixture(2)
		const firstDriver = getTransactionDriver(fixture)
		const firstTransaction = await fixture.adapter.beginTransaction()
		const deleteOperation = {
			kind: 'delete-one',
			query: new QueryBuilder(articleSchema).select({ id: true }).ast,
		} satisfies DeleteOneOperationAst<typeof articleSchema>

		firstDriver.respond([])
		const missing = await firstTransaction.prepare({
			constraints: [],
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
				title: 'Never written',
			}),
		} satisfies UpdateOneOperationAst<typeof articleSchema>

		firstDriver.respond([])
		const missingUpdate = await firstTransaction.prepare({
			constraints: [],
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
			constraints: [],
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
				constraints: [],
				operation: {
					kind: 'find-many',
					query: new QueryBuilder(articleSchema).ast,
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
