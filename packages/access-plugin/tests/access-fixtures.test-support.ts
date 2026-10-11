import {
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
} from '@ultimabase/core'
import { plugin, provideCapability } from '@ultimabase/core/plugin'
import { immutableRecord } from '@ultimabase/shared'

import {
	PreparedMutationTestAdapter,
	PreparedMutationTestTransaction,
	createPreparedUpdateTestOperation,
	type PreparedMutationTestAdapterOptions,
} from '../../../tooling/vitest/prepared-mutation-adapter.js'
import { testDatabaseFilterOperators } from '../../../tooling/vitest/database-filter-operators.js'

export const fixtureRowId = '0199325a-0c00-7000-8000-000000000317'
export const fixtureRow = immutableRecord({
	createdAt: '2026-10-11T00:00:00.000Z',
	id: fixtureRowId,
	secret: 'hidden',
	title: 'visible',
	updatedAt: '2026-10-11T00:00:00.000Z',
})

// Declares the operators the fixtures filter with (ADR-0301).
const capabilities = {
	filterOperators: testDatabaseFilterOperators,
	persistencePlans: databasePersistencePlanCapability,
}

/** Reads inside the transaction (readable-result checks) see `rows`. */
class FixtureTransaction extends PreparedMutationTestTransaction {
	override readonly capabilities = capabilities

	constructor(
		options: PreparedMutationTestAdapterOptions,
		private readonly row: Readonly<Record<string, unknown>>,
	) {
		super(options)
	}

	override execute<const TOperation extends DatabaseOperationAst>(
		request?: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		return readRow(request, this.row)
	}
}

/** Answers one read with the single fixture row, shaped for its terminal. */
const readRow = <const TOperation extends DatabaseOperationAst>(
	request: DatabaseOperationRequest<TOperation> | undefined,
	row: Readonly<Record<string, unknown>>,
): Promise<DatabaseOperationResult<TOperation>> => {
	const kind = request?.operation.kind
	const result: unknown =
		kind === 'exists'
			? true
			: kind === 'count'
				? 1
				: kind === 'find-one' || kind === 'get'
					? row
					: [row]
	// The value matches the terminal `kind` selected above.
	return Promise.resolve(result as DatabaseOperationResult<TOperation>)
}

/** Reads return the fixture row; one update prepares it into `current`. */
export class FixtureAdapter extends PreparedMutationTestAdapter {
	override readonly capabilities = capabilities
	readonly reads: DatabaseOperationRequest[] = []

	constructor(
		private readonly fixtureOptions: PreparedMutationTestAdapterOptions,
		private readonly row: Readonly<Record<string, unknown>>,
		private readonly transactionRow: Readonly<Record<string, unknown>>,
	) {
		super(fixtureOptions)
	}

	override beginTransaction(): Promise<FixtureTransaction> {
		return Promise.resolve(
			new FixtureTransaction(this.fixtureOptions, this.transactionRow),
		)
	}

	override execute<const TOperation extends DatabaseOperationAst>(
		request?: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		if (request !== undefined) this.reads.push(request)
		return readRow(request, this.row)
	}
}

/** Creates the fixture adapter and the plugin that installs it. */
export const createFixtureDatabase = (
	current: Readonly<Record<string, unknown>> = fixtureRow,
) => {
	const adapter = new FixtureAdapter(
		{
			description: 'Access fixture',
			prepare: (request) =>
				createPreparedUpdateTestOperation(request, {
					current,
					description: 'Access fixture',
					previous: fixtureRow,
					result: current,
				}),
		},
		fixtureRow,
		current,
	)
	return {
		adapter,
		plugin: plugin({
			contributions: [
				provideCapability(databaseAdapterCapability, {
					contributionId: 'database-adapter',
					create: () => ({ value: adapter }),
				}),
			],
			core: '^0.0.0',
			id: 'fixture.access-database',
			version: '1.0.0',
		}),
	}
}
