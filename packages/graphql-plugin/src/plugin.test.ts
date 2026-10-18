import { UltimaBase } from '@ultimabase/core'
import { graphql } from 'graphql'
import { describe, expect, it, vi } from 'vitest'

import { graphqlPlugin } from './plugin.js'
import {
	anonymous,
	defineOperation,
	defineOperationValue,
} from '@ultimabase/core/plugin'
import {
	ScriptedTestDatabase,
	testDatabasePlugin,
} from '../../../tooling/vitest/test-database.js'

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

const protectionDatabasePlugin = testDatabasePlugin(
	new ScriptedTestDatabase({ description: 'Protection fixture' }),
	{ id: 'fixture.graphql-protection-database' },
)

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

	it('claims the filesystem only when it writes the SDL', () => {
		expect(
			graphqlPlugin({ sdl: './schema.graphql' }).manifest.environment,
		).toStrictEqual(['environment:filesystem'])
	})

	it.each([
		[{ acknowledgeUnverifiedProtection: true }, 'Unknown'],
		[{ default: { count: 'yes' } }, 'must be a boolean'],
		[{ default: { get: true } }, 'unknown method: get'],
		[{ default: { softDeleteOne: true } }, 'unknown method'],
		[{ publicWrites: 'yes' }, 'publicWrites must be a boolean'],
		[{ sdl: '' }, 'sdl must be a non-empty file path'],
		[{ limits: null }, 'plain object'],
		[
			{ pagination: { maxTake: 0 } },
			'pagination.maxTake must be a positive safe integer',
		],
		[{ pagination: { defaultTake: 2.5 } }, 'safe integer'],
		[
			{ pagination: { unknown: 1 } },
			'pagination has an unknown option: unknown',
		],
		[{ pagination: null }, 'pagination must be a plain object'],
		[
			{ pagination: { defaultTake: 2_147_483_648, maxTake: 2_147_483_648 } },
			'GraphQL Int range',
		],
		[{ pagination: { defaultTake: 10, maxTake: 5 } }, 'must not exceed'],
		[{ limits: { maxPageSize: 10 } }, 'unknown option'],
		[{ limits: { unknown: 1 } }, 'unknown option'],
		[{ operations: [optionOperation] }, 'Unknown'],
		[{ hide: null }, 'must be an array'],
		[{ hide: [{}] }, 'must be an operation token'],
		[{ hide: [optionOperation, optionOperation] }, 'repeats'],
		[
			{ hide: [{ ...optionOperation, target: 'schema' }] },
			'must be an operation token',
		],
		[{ schemas: null }, 'must be an array'],
		[{ schemas: [{}] }, 'completed GraphQLSchema'],
		[{ instanceId: 'secondary' }, 'Unknown'],
	])('rejects malformed options %#', (options, message) => {
		expect(() => graphqlPlugin(options as never)).toThrow(message)
	})

	it('refuses public writes without a protected policy unless publicWrites (ADR-0294)', async () => {
		const PublicRecord = UltimaBase.Schema.define({
			className: 'GraphqlProtectionRecord',
			fields: (field) => ({ value: field.string() }),
		})
		const refused = new (UltimaBase.use(
			graphqlPlugin(),
			protectionDatabasePlugin,
		))({ logger: false, schemas: [PublicRecord] })
		await expect(refused.start()).rejects.toThrow(
			'GraphQL exposes writes (createGraphqlProtectionRecord, updateGraphqlProtectionRecord, deleteGraphqlProtectionRecord) but no protected policy plugin is installed: install one, such as accessPlugin(), or pass graphqlPlugin({ publicWrites: true }) to let every client write.',
		)
		await refused.dispose()

		const readOnly = new (UltimaBase.use(
			graphqlPlugin({
				default: { createOne: false, deleteOne: false, updateOne: false },
			}),
			protectionDatabasePlugin,
		))({ logger: false, schemas: [PublicRecord] })
		await readOnly.start()
		await readOnly.dispose()

		const warning = vi
			.spyOn(console, 'warn')
			.mockImplementation(() => undefined)
		const opted = new (UltimaBase.use(
			graphqlPlugin({ publicWrites: true }),
			protectionDatabasePlugin,
		))({ schemas: [PublicRecord] })
		await opted.start()
		// The unverified-protection warning of Core is gone (ADR-0325).
		expect(
			warning.mock.calls.some((call) =>
				call.some((value) => String(value).includes('unverified')),
			),
		).toBe(false)
		await opted.dispose()
		warning.mockRestore()
	})

	it('rejects generated execution after application disposal', async () => {
		const DisposableRecord = UltimaBase.Schema.define({
			className: 'GraphqlDisposedRecord',
			fields: (field) => ({ value: field.string() }),
		})
		const application = new (UltimaBase.use(
			graphqlPlugin({ publicWrites: true }),
			protectionDatabasePlugin,
		))({
			logger: false,
			schemas: [DisposableRecord],
		})
		await application.start()
		const graphqlApplication = application.plugin('@ultimabase/graphql-plugin')
		const schema = graphqlApplication.schema
		const request = anonymous(application, {
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
