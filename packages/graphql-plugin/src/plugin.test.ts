import {
	Schema,
	UltimaBase,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	defineOperation,
	defineOperationValue,
	definePlugin,
	provideCapability,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
} from '@ultimabase/core'
import { describe, expect, it, vi } from 'vitest'
import { graphql } from 'graphql'

import { graphqlPlugin } from './plugin.js'

const nullValue = defineOperationValue((value: unknown): null => {
	if (value !== null) throw new TypeError('Expected null')
	return null
})
const optionOperation = defineOperation({
	input: nullValue,
	name: 'fixture.graphql-option.operation',
	result: nullValue,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})
const schemaOptionOperation = defineOperation({
	input: nullValue,
	name: 'fixture.graphql-option.schema-operation',
	result: nullValue,
	target: 'schema',
	transaction: 'forbidden',
	version: '1.0.0',
})

class ProtectionDatabase implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		void request
		return Promise.reject(new TypeError('Protection fixture does not execute'))
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		return Promise.reject(new TypeError('Protection fixture does not mutate'))
	}
}

const protectionDatabasePlugin = definePlugin({
	core: '^0.0.0',
	pluginId: 'fixture.graphql-protection-database',
	version: '1.0.0',
	capabilities: {
		provides: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database',
				create: () => ({ value: new ProtectionDatabase() }),
			}),
		],
	},
})

describe('graphqlPlugin', () => {
	it('declares one unambiguous privileged application capability', () => {
		const plugin = graphqlPlugin()

		expect(plugin.manifest).toMatchObject({
			identity: { pluginId: '@ultimabase/graphql-plugin' },
			capabilities: {
				provides: [{ contributionId: 'official-graphql-application' }],
			},
			environment: [],
			privileges: [{ name: 'schema:declare' }, { name: 'transport:expose' }],
		})
		expect(plugin.manifest.identity).not.toHaveProperty('instanceId')
	})

	it.each([
		[{ acknowledgeUnverifiedProtection: false }, 'must be true'],
		[{ default: { get: 'yes' } }, 'must be a boolean'],
		[{ limits: null }, 'plain object'],
		[{ limits: { maxPageSize: 0 } }, 'greater than or equal to 1'],
		[{ limits: { defaultPageSize: 10, maxPageSize: 5 } }, 'must not exceed'],
		[{ limits: { unknown: 1 } }, 'unknown option'],
		[{ operations: null }, 'must be an array'],
		[{ operations: [{}] }, 'must be an operation token'],
		[{ operations: [optionOperation, optionOperation] }, 'repeats'],
		[{ operations: [schemaOptionOperation] }, 'must target the application'],
		[{ schemas: null }, 'must be an array'],
		[{ schemas: [{}] }, 'completed GraphQLSchema'],
		[{ instanceId: 'secondary' }, 'Unknown'],
	])('rejects malformed options %#', (options, message) => {
		expect(() => graphqlPlugin(options as never)).toThrow(message)
	})

	it('shares the Core public-protection diagnostic and honors acknowledgment', async () => {
		const PublicRecord = Schema.define({
			className: 'GraphqlProtectionRecord',
			fields: (field) => ({ value: field.string() }),
		})
		const warning = vi
			.spyOn(console, 'warn')
			.mockImplementation(() => undefined)
		const unacknowledged = new UltimaBase({
			plugins: [graphqlPlugin(), protectionDatabasePlugin],
			schemas: [PublicRecord],
		})
		await unacknowledged.start()
		expect(
			warning.mock.calls.some((call) =>
				call.some(
					(value) =>
						typeof value === 'object' &&
						value !== null &&
						Reflect.get(value, 'code') ===
							'UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION' &&
						Reflect.get(Reflect.get(value, 'transport'), 'name') ===
							'ultimabase.graphql',
				),
			),
		).toBe(true)
		await unacknowledged.dispose()

		warning.mockClear()
		const acknowledged = new UltimaBase({
			plugins: [
				graphqlPlugin({ acknowledgeUnverifiedProtection: true }),
				protectionDatabasePlugin,
			],
			schemas: [PublicRecord],
		})
		await acknowledged.start()
		expect(
			warning.mock.calls.some((call) =>
				call.some(
					(value) =>
						typeof value === 'object' &&
						value !== null &&
						Reflect.get(value, 'code') ===
							'UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION',
				),
			),
		).toBe(false)
		await acknowledged.dispose()
		warning.mockRestore()
	})

	it('rejects generated execution after application disposal', async () => {
		const DisposableRecord = Schema.define({
			className: 'GraphqlDisposedRecord',
			fields: (field) => ({ value: field.string() }),
		})
		const application = new UltimaBase({
			pluginPrivileges: { logger: false },
			plugins: [
				graphqlPlugin({ acknowledgeUnverifiedProtection: true }),
				protectionDatabasePlugin,
			],
			schemas: [DisposableRecord],
		})
		await application.start()
		const graphqlApplication = application.application.getPlugin(
			'@ultimabase/graphql-plugin',
		)
		const schema = graphqlApplication.schema
		const request = application.engine.anonymous({
			requestId: 'graphql-disposed-request',
			source: 'ultimabase.graphql',
		}).context
		await application.dispose()

		const result = await graphql({
			contextValue: { request },
			schema,
			source: '{ existsGraphqlDisposedRecord }',
		})
		expect(result).toMatchObject({
			data: null,
			errors: [
				{
					extensions: {
						code: 'INTERNAL_SERVER_ERROR',
						requestId: 'graphql-disposed-request',
					},
					message: 'Unexpected error.',
				},
			],
		})
	})
})
