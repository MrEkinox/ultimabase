import {
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	definePlugin,
	provideCapability,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
} from '@ultimabase/core'

export const apiPostRow = Object.freeze({
	createdAt: '2026-09-14T12:00:00.000Z',
	id: '0199b38e-ef80-7000-8000-000000000201',
	published: true,
	title: 'One Runtime, three interfaces',
	updatedAt: '2026-09-14T12:00:00.000Z',
})

class ApiReadAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		const row: Record<string, unknown> = {}
		for (const selection of request.plan.returning.selection.fields) {
			const key = selection.field as keyof typeof apiPostRow
			row[selection.field] = apiPostRow[key]
		}
		const result =
			request.operation.kind === 'find-many'
				? [row]
				: request.operation.kind === 'count'
					? 1
					: request.operation.kind === 'exists'
						? true
						: row
		return Promise.resolve(
			result as unknown as DatabaseOperationResult<TOperation>,
		)
	}

	beginTransaction(): Promise<never> {
		return Promise.reject(
			new TypeError('API documentation fixture is read-only'),
		)
	}
}

export const apiDatabasePlugin = definePlugin({
	capabilities: {
		provides: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database',
				create: () => ({ value: new ApiReadAdapter() }),
			}),
		],
	},
	core: '^0.0.0',
	pluginId: 'fixture.website-api-database',
	version: '0.0.0',
})
