import {
	databaseAdapterCapability,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
} from '@ultimabase/core'
import {
	plugin,
	provideCapability,
	type PluginDefinition,
} from '@ultimabase/core/plugin'

class EmptyHttpTestDatabaseAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly checkHealth: () => Promise<void>

	constructor(checkHealth: () => Promise<void>) {
		this.checkHealth = checkHealth
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		void request
		return Promise.resolve([] as unknown as DatabaseOperationResult<TOperation>)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		throw new TypeError('HTTP test adapter does not execute mutations')
	}
}

/** Creates the inert adapter required to start a request-execution test fixture. */
export const httpTestDatabasePlugin = (
	checkHealth: () => Promise<void> = () => Promise.resolve(),
): PluginDefinition =>
	plugin({
		id: 'fixture.http-database',
		version: '1.0.0',
		core: '^0.0.0',
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'empty-http-test-adapter',
				create: () => ({ value: new EmptyHttpTestDatabaseAdapter(checkHealth) }),
			}),
		],
	})
