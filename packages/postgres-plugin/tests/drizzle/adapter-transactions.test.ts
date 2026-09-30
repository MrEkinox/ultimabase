import {
	QueryBuilder,
	databaseConstraint,
	createDatabasePersistencePlan,
	normalizeUpdateExpression,
	type DeleteOneOperationAst,
	type UpdateOneOperationAst,
	type UpsertOneOperationAst,
} from '@ultimabase/core'

import { describe, expect, it } from 'vitest'

import {
	execute,
	prepare,
} from '../../src/drizzle/database-request.test-fixture.js'

import {
	articleSchema,
	tenantCompiler,
	createConstraintCompilerRegistry,
	createFixture,
	getTransactionDriver,
	firstId,
	secondId,
	timestamp,
	articleRow,
} from './adapter-fixtures.js'

describe('internal PostgreSQL database adapter transactions', () => {
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
		driver.respond([])
		driver.respond([articleRow(null, 'Created', 0, firstId)])
		const preparedCreate = await prepare(transaction, {
			constraints: [],
			operation,
		})
		await expect(preparedCreate.execute()).resolves.toStrictEqual({
			materializations: [{ current: create, kind: 'create' }],
			result: { id: firstId, title: 'Created' },
		})
		// PostgreSQL may see a different unique index first; the subsequent
		// target lock, not the insert arbiter, decides the upsert branch.
		expect(
			driver.calls.find(({ text }) => text.startsWith('insert'))?.text,
		).toMatch(/on conflict do nothing/u)

		const current = { ...create, title: 'Updated' }
		driver.respond([articleRow(null, 'Created', 0, firstId)])
		driver.respond([articleRow(null, 'Updated', 0, firstId)])
		const preparedUpdate = await prepare(transaction, {
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
		const prepared = await prepare(transaction, {
			constraints: [],
			operation: {
				items: [
					item(firstId, first),
					item(secondId, { ...first, id: secondId }),
				],
				kind: 'upsert-many',
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
		await transaction.rollback()
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
		const finalConstraints = [
			...constraints,
			databaseConstraint('fixture.tenant', 1, { tenantId: 'tenant-final' }),
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
		const preparedUpdate = await prepare(transaction, {
			constraints,
			operation: updateOperation,
		})
		const lockCall = driver.calls.at(-1)

		expect(lockCall?.text).toMatch(/where .* and .*note.*for update/u)
		expect(lockCall?.params).toContain('tenant-1')

		driver.respond([['tenant-1', 'Updated', 1, firstId, timestamp, timestamp]])
		await preparedUpdate.execute({
			constraints: finalConstraints,
			operation: updateOperation,
			plan: createDatabasePersistencePlan(updateOperation),
		})
		const updateCall = driver.calls.at(-1)

		expect(updateCall?.text).toMatch(/update .* where \(.*id.* and .*note/u)
		expect(updateCall?.params).toContain(firstId)
		expect(updateCall?.params).toContain('tenant-1')
		expect(updateCall?.params).toContain('tenant-final')

		const deleteOperation = {
			kind: 'delete-one',
			query: new QueryBuilder(articleSchema).where((where) =>
				where.eq('title', 'Updated'),
			).ast,
		} satisfies DeleteOneOperationAst<typeof articleSchema>

		driver.respond([['tenant-1', 'Updated', 1, firstId, timestamp, timestamp]])
		const preparedDelete = await prepare(transaction, {
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

		const preparedMany = await prepare(transaction, {
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
		const upsertCallOffset = driver.calls.length

		driver.respond([])
		const preparedUpsert = await prepare(transaction, {
			constraints,
			operation: upsertOperation,
		})

		// The empty insert models a concurrent winner between the two target locks.
		driver.respond([])
		driver.respond([])
		driver.respond([articleRow('tenant-1', 'Concurrent winner', 1, firstId)])
		driver.respond([articleRow('tenant-1', 'Upsert updated', 1, firstId)])
		await preparedUpsert.execute()

		const upsertCalls = driver.calls.slice(upsertCallOffset)
		const upsertLocks = upsertCalls.filter(({ text }) =>
			text.includes('for update'),
		)
		const upsertUpdate = upsertCalls.at(-1)

		for (const lockCall of upsertLocks) {
			expect(lockCall.text).toMatch(/where .* and .*note.*for update/u)
			expect(lockCall.params).toContain('tenant-1')
		}
		expect(upsertLocks).toHaveLength(3)
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
		const missing = await prepare(firstTransaction, {
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
		const missingUpdate = await prepare(firstTransaction, {
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
		const escaped = await prepare(secondTransaction, {
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
			execute(commitTransaction, {
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
