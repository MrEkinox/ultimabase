import {
	Query,
	normalizeUpdateExpression,
	type CreateOneOperationAst,
	type DeleteOneOperationAst,
	type FindOperationAst,
	type QueryFilterNode,
	type UpdateOneOperationAst,
} from '@ultimabase/query'
import { Schema, intField, stringField } from '@ultimabase/schema'
import { isPlainRecord, isUnknownArray } from '@ultimabase/shared'
import {
	createRuntimeValidationStage,
	RequestContext,
	requestSources,
} from '@ultimabase/runtime'
import { describe, expect, it } from 'vitest'

import { createPostgresDatabaseAdapter } from './adapter.js'
import {
	createPostgresDrizzleClient,
	type PostgresDriverQueryClient,
} from './client.js'
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

/** Emulates only node-postgres' query boundary while Drizzle builds and maps real SQL. */
class FixtureDriver implements PostgresDriverQueryClient {
	readonly #responses: (Error | FixtureDriverResult)[] = []
	readonly calls: RecordedDriverQuery[] = []

	respond(rows: readonly (readonly unknown[])[]): void {
		this.#responses.push({ rows })
	}

	fail(error: Error): void {
		this.#responses.push(error)
	}

	query(...arguments_: never[]): unknown {
		const values: readonly unknown[] = arguments_
		const configuration = values[0]
		const parameters = values[1]

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
}

const createFixture = () => {
	const driver = new FixtureDriver()
	const adapter = createPostgresDatabaseAdapter(
		createPostgresDrizzleClient(driver),
		new PostgresSchemaCatalog([articleSchema]),
	)

	return { adapter, driver }
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

	it('fails closed for unsupported access, bulk, transactions, and driver errors', async () => {
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

		await expect(adapter.beginTransaction()).rejects.toMatchObject({
			code: 'TRANSACTION_ERROR',
			internalDetails: {
				reason: 'postgres-transactions-not-implemented',
			},
		})
	})
})
