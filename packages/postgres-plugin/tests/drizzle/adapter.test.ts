import {
	FrameworkError,
	QueryBuilder,
	Pointer,
	createDatabasePersistencePlan,
	createRuntimeValidationStage,
	increment,
	normalizeUpdateExpression,
	RequestContext,
	requestSources,
	type CreateOneOperationAst,
	type DeleteOneOperationAst,
	type FindManyOperationAst,
	type FindOneOperationAst,
	type QueryExpressionNode,
	type QueryFilterNode,
	type UpdateOneOperationAst,
} from '@ultimabase/core'

import { describe, expect, it } from 'vitest'

import { createPostgresDatabaseAdapter } from '../../src/drizzle/adapter.js'
import { execute } from '../../src/drizzle/database-request.test-fixture.js'

import {
	FixtureDriver,
	FixturePool,
} from '../../src/drizzle/database-adapter.test-fixture.js'

import {
	articleSchema,
	pointerUserSchema,
	pointerPostSchema,
	pointerCatalog,
	createFixture,
	firstId,
	secondId,
	timestamp,
} from './adapter-fixtures.js'

describe('internal PostgreSQL database adapter reads', () => {
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
		const created = await execute(adapter, {
			operation: normalized,
		})

		expect(Pointer.is(created.author)).toBe(true)
		expect(author.equals(created.author)).toBe(true)
		expect(driver.calls[0]?.params).toContain(secondId)

		const query = new QueryBuilder(pointerPostSchema).where((where) =>
			where.eq('author', author.id),
		)

		driver.respond([[secondId, firstId, timestamp, timestamp]])
		const [found] = await execute(adapter, {
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
		await expect(execute(adapter, { operation: find })).resolves.toStrictEqual([
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
		const projected = await execute(adapter, {
			operation: titleOnly,
		})

		expect(projected).toStrictEqual([
			{ id: firstId, title: 'Private identity' },
		])
		const projectedRecord = projected[0]

		if (projectedRecord === undefined) {
			throw new TypeError('PostgreSQL projection fixture returned no record')
		}

		expect(adapter.readObjectIdentity?.(projectedRecord)).toBe(firstId)

		const withoutNote = new QueryBuilder(articleSchema).select({ note: false })

		driver.respond([['Public article', 3, firstId, timestamp, timestamp]])
		await expect(
			execute(adapter, {
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
			execute(adapter, {
				operation: { kind: 'find-one', query: query.ast },
			}),
		).resolves.toBeNull()

		driver.respond([])
		await expect(
			execute(adapter, {
				operation: { kind: 'get', query: query.ast, id: firstId },
			}),
		).resolves.toBeNull()
		expect(driver.calls.at(-1)?.params).toContain(firstId)

		driver.respond([[2]])
		await expect(
			execute(adapter, {
				operation: { kind: 'count', query: query.ast },
			}),
		).resolves.toBe(2)
		expect(driver.calls.at(-1)?.text).toContain('ultimabase_count_target')

		driver.respond([[firstId]])
		await expect(
			execute(adapter, {
				operation: { kind: 'exists', query: query.ast },
			}),
		).resolves.toBe(true)
	})

	it('combines the protected row filter with query predicates using parameterized AND', async () => {
		const { adapter, driver } = createFixture()
		const injectedTenant = "tenant' OR true --"
		const operation = {
			kind: 'find-many',
			query: new QueryBuilder(articleSchema).where((where) =>
				where.gt('views', 10),
			).ast,
		} satisfies FindManyOperationAst<typeof articleSchema>
		const rowFilter = new QueryBuilder(articleSchema).where((where) =>
			where.eq('note', injectedTenant),
		).ast.where?.expression

		if (rowFilter === undefined) {
			throw new TypeError('Access row-filter fixture requires an expression')
		}

		driver.respond([])
		await execute(adapter, {
			operation,
			rowFilter,
		})

		const call = driver.calls[0]

		expect(call?.params).toStrictEqual([10, injectedTenant])
		// Redundant parentheses are a Drizzle rendering detail; every predicate is conjunctive here.
		const queryText = call?.text.replaceAll(/[()]/gu, '')
		const tableAlias = /from "articles" as "([^"]+)"/u.exec(
			queryText ?? '',
		)?.[1]

		if (tableAlias === undefined) {
			throw new TypeError('Relational query fixture requires a table alias')
		}

		expect(queryText).toContain(
			`where "${tableAlias}"."views" > $1 and "${tableAlias}"."note" = $2`,
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
			execute(adapter, { operation: normalized }),
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
			execute(adapter, { operation: updateOperation }),
		).resolves.toStrictEqual({ id: firstId, title: 'Updated' })
		expect(driver.calls.at(-1)?.text).toMatch(
			/update "articles" set .* where "articles"\."id" in \(select/u,
		)

		driver.respond([[firstId, 'Updated']])
		await expect(
			execute(adapter, { operation: deleteOperation }),
		).resolves.toStrictEqual({ id: firstId, title: 'Updated' })
		expect(driver.calls.at(-1)?.text).toMatch(
			/delete from "articles" where "articles"\."id" in \(select/u,
		)

		driver.respond([])
		await expect(
			execute(adapter, { operation: updateOperation }),
		).resolves.toBeNull()
	})

	it('fails closed for root upserts and driver errors', async () => {
		const { adapter, driver } = createFixture()
		const operation = {
			kind: 'find-many',
			query: new QueryBuilder(articleSchema).ast,
		} satisfies FindManyOperationAst<typeof articleSchema>

		await expect(
			execute(adapter, {
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
			execute(adapter, {
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
			// This runtime fixture deliberately runs without an application type file.
			// The target identity was checked above and is restored only for this test operation.
			query: inclusion.query as unknown as FindOneOperationAst<
				typeof pointerUserSchema,
				QueryExpressionNode,
				'name'
			>['query'],
		}

		const secret = 'select private_value from internal_table'

		driver.fail(Object.assign(new Error(secret), { code: '08006' }))
		const failure: unknown = await execute(adapter, {
			operation: { kind: 'find-many', query: query.ast },
			inclusions: [
				{
					fieldPath: ['author'],
					kind: 'pointer',
					request: {
						operation: targetOperation,
						plan: createDatabasePersistencePlan(targetOperation),
					},
				},
			],
		}).catch((error: unknown) => error)

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
})
