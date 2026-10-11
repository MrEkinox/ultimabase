import {
	createDatabasePersistencePlan,
	databasePluginFieldStructuralContainsCapability,
	normalizeUpdateExpression,
	rewriteDeletePersistencePlan,
	UltimaBase,
	type CreateOneOperationAst,
	type DatabasePersistencePlan,
	type DeleteOneOperationAst,
	type FindOneOperationAst,
} from '@ultimabase/core'
import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import type {
	PostgresPool,
	PostgresPoolClient,
} from '../connection/contracts.js'
import { PostgresSchemaCatalog } from '../schema/catalog.js'
import { createPostgresDatabaseAdapter } from './adapter.js'
import type { PostgresDriverQueryClient } from './client.js'
import { readPostgresPersistenceOperation } from './persistence-plan.js'
import { QueryBuilder } from '@ultimabase/core/plugin'

interface DriverResult {
	readonly rowCount: number
	readonly rows: readonly (readonly unknown[])[]
}

/** Records real Drizzle SQL while serving deterministic PostgreSQL row tuples. */
class PersistenceDriver
	implements PostgresDriverQueryClient, PostgresPoolClient
{
	readonly calls: {
		readonly params: readonly unknown[]
		readonly text: string
	}[] = []
	readonly #responses: DriverResult[] = []

	respond(rows: readonly (readonly unknown[])[]): void {
		this.#responses.push({ rowCount: rows.length, rows })
	}

	query(...arguments_: unknown[]): Promise<DriverResult> {
		const configuration = arguments_[0]
		const parameters = arguments_[1]

		if (
			configuration === 'BEGIN' ||
			configuration === 'COMMIT' ||
			configuration === 'ROLLBACK'
		) {
			return Promise.resolve({ rowCount: 0, rows: [] })
		}
		if (
			!isPlainRecord(configuration) ||
			typeof configuration.text !== 'string' ||
			!isUnknownArray(parameters)
		) {
			return Promise.reject(new TypeError('Invalid persistence fixture query'))
		}

		this.calls.push({ params: parameters, text: configuration.text })
		const response = this.#responses.shift()
		return response === undefined
			? Promise.reject(new TypeError('Missing persistence fixture response'))
			: Promise.resolve(response)
	}

	release(): void {
		return undefined
	}
}

class PersistencePool implements PostgresPool {
	constructor(private readonly driver: PersistenceDriver) {}

	connect(): Promise<PostgresPoolClient> {
		return Promise.resolve(this.driver)
	}

	end(): Promise<void> {
		return Promise.resolve()
	}

	query(...arguments_: unknown[]): Promise<DriverResult> {
		return this.driver.query(...arguments_)
	}
}

const schema = UltimaBase.Schema.define({
	className: 'PostgresPersistencePlan',
	fields: (field) => ({ title: field.string() }),
})
const id = '0198c3d4-1000-7000-8000-000000000001'
const timestamp = '2026-08-19T10:00:00.000Z'
const virtualSchema = UltimaBase.Schema.define({
	className: 'PostgresVirtualPersistencePlan',
	fields: (field) => ({
		secret: field.string({ required: true }),
		display: field.virtual({
			output: (output) => output.string({ nullable: false }),
			select: { secret: true },
			resolve: ({ item }) => String(item.secret).toUpperCase(),
		}),
	}),
})

const replaceReturningSelection = <
	const TOperation extends
		| FindOneOperationAst<typeof virtualSchema>
		| CreateOneOperationAst<typeof virtualSchema>,
>(
	operation: TOperation,
): DatabasePersistencePlan<TOperation> => {
	const plan = createDatabasePersistencePlan(operation)
	const selection = new QueryBuilder(virtualSchema).select({ secret: true }).ast
		.selection

	return immutableRecord({
		...plan,
		returning: immutableRecord({ ...plan.returning, selection }),
	})
}

describe('PostgreSQL persistence plans', () => {
	it('compiles only Core persisted returning fields into read SQL', async () => {
		const driver = new PersistenceDriver()
		const adapter = createPostgresDatabaseAdapter(
			new PersistencePool(driver),
			new PostgresSchemaCatalog([virtualSchema]),
		)
		const operation = {
			kind: 'find-one',
			query: new QueryBuilder(virtualSchema).select({ display: true }).ast,
		} satisfies FindOneOperationAst<typeof virtualSchema>
		const plan = replaceReturningSelection(operation)
		const physical = readPostgresPersistenceOperation(operation, plan)

		expect(physical).toMatchObject({
			kind: 'find-one',
			query: { selection: { fields: [{ field: 'secret' }, { field: 'id' }] } },
		})
		driver.respond([['private', id]])
		await expect(adapter.execute({ operation, plan })).resolves.toStrictEqual({
			id,
			secret: 'private',
		})
		expect(driver.calls).toHaveLength(1)
		expect(driver.calls[0]?.text).toContain('"secret"')
		expect(driver.calls[0]?.text).toContain('"id"')
		expect(driver.calls[0]?.text).not.toContain('"display"')
	})

	it('keeps direct and prepared create planning in parity', async () => {
		const driver = new PersistenceDriver()
		const adapter = createPostgresDatabaseAdapter(
			new PersistencePool(driver),
			new PostgresSchemaCatalog([virtualSchema]),
		)
		const operation = {
			input: { secret: 'private' },
			kind: 'create-one',
			schema: new QueryBuilder(virtualSchema).ast.schema,
			selection: new QueryBuilder(virtualSchema).select({ display: true }).ast
				.selection,
		} satisfies CreateOneOperationAst<typeof virtualSchema>
		const plan = replaceReturningSelection(operation)

		driver.respond([['private', id, timestamp, timestamp]])
		const direct = await adapter.execute({ operation, plan })
		const directStatement = driver.calls.at(-1)
		const transaction = await adapter.beginTransaction()
		const prepared = await transaction.prepare({
			operation,
			plan,
		})
		driver.respond([['private', id, timestamp, timestamp]])
		const outcome = await prepared.execute()
		const preparedStatement = driver.calls.at(-1)

		expect(direct).toStrictEqual({ id, secret: 'private' })
		expect(outcome.result).toStrictEqual(direct)
		expect(preparedStatement).toStrictEqual(directStatement)
		expect(preparedStatement?.text).not.toContain('"display"')
		await transaction.commit()
	})

	it('updates a tombstone while returning one logical delete preimage', async () => {
		const driver = new PersistenceDriver()
		const adapter = createPostgresDatabaseAdapter(
			new PersistencePool(driver),
			new PostgresSchemaCatalog([schema]),
		)
		const transaction = await adapter.beginTransaction()
		expect(adapter.capabilities?.persistencePlans?.version).toBe(2)
		expect(transaction.capabilities?.persistencePlans?.version).toBe(2)
		expect(adapter.capabilities?.pluginFieldStructuralContains).toBe(
			databasePluginFieldStructuralContainsCapability,
		)
		expect(transaction.capabilities?.pluginFieldStructuralContains).toBe(
			databasePluginFieldStructuralContainsCapability,
		)
		const operation = {
			kind: 'delete-one',
			query: new QueryBuilder(schema)
				.where((where) => where.eq('id', id))
				.select({ id: true, title: true }).ast,
		} satisfies DeleteOneOperationAst<typeof schema>
		const canonical = createDatabasePersistencePlan(operation)
		const rewritten = rewriteDeletePersistencePlan(
			canonical,
			normalizeUpdateExpression(schema, { title: 'TOMBSTONED' }),
		)
		const previous = {
			createdAt: timestamp,
			id,
			title: 'Visible',
			updatedAt: timestamp,
		}

		driver.respond([['Visible', id, timestamp, timestamp]])
		const prepared = await transaction.prepare({
			operation,
			plan: canonical,
		})
		driver.respond([['TOMBSTONED', id, timestamp, timestamp]])
		const outcome = await prepared.execute({
			operation,
			plan: rewritten,
		})

		expect(outcome).toStrictEqual({
			materializations: [{ kind: 'delete', previous }],
			result: { id, title: 'Visible' },
		})
		expect(driver.calls.at(-1)?.text).toMatch(/update .* where .*id/u)
		expect(driver.calls.at(-1)?.text).not.toMatch(/delete/u)
		expect(driver.calls.at(-1)?.params).toContain('TOMBSTONED')
		await transaction.commit()
	})
})
