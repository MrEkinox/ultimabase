import {
	QueryBuilder,
	databaseConstraint,
	createDatabasePersistencePlan,
	increment,
	normalizeUpdateExpression,
	type CreateOneOperationAst,
	type DeleteOneOperationAst,
	type FindManyOperationAst,
	type QueryFilterNode,
	type UpdateOneOperationAst,
} from '@ultimabase/core'

import { describe, expect, it } from 'vitest'

import { createPostgresDatabaseAdapter } from '../../src/drizzle/adapter.js'
import {
	execute,
	prepare,
} from '../../src/drizzle/database-request.test-fixture.js'

import { postgresConstraintCompiler } from '../../src/constraints/definition.js'

import {
	FixtureDriver,
	FixturePool,
} from '../../src/drizzle/database-adapter.test-fixture.js'

import {
	articleSchema,
	relationTargetSchema,
	relationSourceSchema,
	relationCatalog,
	tenantCompiler,
	createConstraintCompilerRegistry,
	createFixture,
	getTransactionDriver,
	firstId,
	secondId,
	timestamp,
	articleRow,
} from './adapter-fixtures.js'

describe('internal PostgreSQL database adapter preparation', () => {
	it('compiles private row filters inside eager relation branches', async () => {
		const driver = new FixtureDriver()
		const pool = new FixturePool(driver, [])
		const adapter = createPostgresDatabaseAdapter(pool, relationCatalog)
		const query = new QueryBuilder(relationSourceSchema).include(
			'targets',
			(targets) => targets.where((where) => where.eq('label', 'caller')),
		)
		const inclusion = query.ast.inclusion.fields[0]

		if (inclusion === undefined) {
			throw new TypeError('Eager relation fixture requires one inclusion')
		}
		const targetOperation: FindManyOperationAst<typeof relationTargetSchema> = {
			kind: 'find-many',
			query: inclusion.query as unknown as FindManyOperationAst<
				typeof relationTargetSchema
			>['query'],
		}
		const rowFilter = new QueryBuilder(relationTargetSchema).where((where) =>
			where.eq('visible', true),
		).ast.where?.expression

		if (rowFilter === undefined) {
			throw new TypeError('Eager relation fixture requires one private filter')
		}

		driver.fail(new Error('stop after SQL compilation'))
		await expect(
			execute(adapter, {
				constraints: [],
				operation: { kind: 'find-many', query: query.ast },
				inclusions: [
					{
						fieldPath: ['targets'],
						kind: 'relation',
						request: {
							constraints: [],
							operation: targetOperation,
							plan: createDatabasePersistencePlan(targetOperation),
							rowFilter,
						},
					},
				],
			}),
		).rejects.toMatchObject({ code: 'INTERNAL_ERROR' })

		expect(driver.calls).toHaveLength(1)
		expect(driver.calls[0]?.params).toEqual(
			expect.arrayContaining(['caller', true]),
		)
		expect(driver.calls[0]?.text.toLowerCase()).toContain('and')
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
				execute(adapter, {
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
			execute(adapter, {
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
			execute(adapter, {
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
			execute(transaction, { constraints: [], operation }),
		).resolves.toStrictEqual([{ id: firstId, title: 'Transactional' }])
		await transaction.commit()

		expect(pool.connectCalls).toBe(1)
		expect(rootDriver.calls).toStrictEqual([])
		expect(driver.transactionCalls).toStrictEqual(['BEGIN', 'COMMIT'])
		expect(driver.releaseCalls).toBe(1)
		expect(() => execute(transaction, { constraints: [], operation })).toThrow(
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
		const preparedCreate = await prepare(transaction, {
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
		const preparedUpdate = await prepare(transaction, {
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
		const updateOutcome = await preparedUpdate.execute({
			constraints: [],
			operation: resolvedUpdateOperation,
			plan: createDatabasePersistencePlan(resolvedUpdateOperation),
		})

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
		const preparedDelete = await prepare(transaction, {
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
		const prepared = await prepare(transaction, {
			constraints: [],
			operation: {
				inputs: [first, second],
				kind: 'create-many',
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

		const empty = await prepare(transaction, {
			constraints: [],
			operation: {
				inputs: [],
				kind: 'create-many',
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
		const preparedUpdate = await prepare(transaction, {
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

		const preparedDelete = await prepare(transaction, {
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

	it('prepares stable set-based item snapshots only when Runtime requests them', async () => {
		const fixture = createFixture()
		const driver = getTransactionDriver(fixture)
		const transaction = await fixture.adapter.beginTransaction()
		const query = new QueryBuilder(articleSchema)
			.where((where) => where.gt('views', 0))
			.select({ id: true, title: true })
			.descending('views')
		const first = {
			createdAt: timestamp,
			id: firstId,
			note: null,
			title: 'First',
			updatedAt: timestamp,
			views: 1,
		}
		const second = {
			...first,
			id: secondId,
			title: 'Second',
			views: 2,
		}

		driver.respond([
			articleRow(null, 'Second', 2, secondId),
			articleRow(null, 'First', 1, firstId),
		])
		const preparedUpdate = await prepare(transaction, {
			constraints: [],
			operation: {
				kind: 'update-many',
				query: query.ast,
				update: normalizeUpdateExpression(articleSchema, {
					views: increment(1),
				}),
			},
			prepareMutationItems: true,
		})

		expect(preparedUpdate.targets).toStrictEqual([second, first])
		expect(driver.calls[0]?.text).toMatch(
			/select .* order by .*views.*desc.*id.*asc.*for update/u,
		)

		// PostgreSQL RETURNING order is not guaranteed; the adapter restores lock order.
		driver.respond([
			articleRow(null, 'First', 2, firstId),
			articleRow(null, 'Second', 3, secondId),
		])
		await expect(preparedUpdate.execute()).resolves.toStrictEqual({
			materializations: [
				{
					current: { ...second, views: 3 },
					kind: 'update',
					previous: second,
				},
				{
					current: { ...first, views: 2 },
					kind: 'update',
					previous: first,
				},
			],
			result: [
				{ id: secondId, title: 'Second' },
				{ id: firstId, title: 'First' },
			],
		})
		expect(driver.calls[1]?.text).toMatch(
			/update .*where .*id.*in .* returning .*note.*title.*views/u,
		)

		driver.respond([
			articleRow(null, 'Second', 3, secondId),
			articleRow(null, 'First', 2, firstId),
		])
		const preparedDelete = await prepare(transaction, {
			constraints: [],
			operation: { kind: 'delete-many', query: query.ast },
			prepareMutationItems: true,
		})

		driver.respond([
			articleRow(null, 'First', 2, firstId),
			articleRow(null, 'Second', 3, secondId),
		])
		await expect(preparedDelete.execute()).resolves.toStrictEqual({
			materializations: [
				{ kind: 'delete', previous: { ...second, views: 3 } },
				{ kind: 'delete', previous: { ...first, views: 2 } },
			],
			result: [
				{ id: secondId, title: 'Second' },
				{ id: firstId, title: 'First' },
			],
		})
		expect(driver.calls).toHaveLength(4)
		await transaction.rollback()
	})
})
