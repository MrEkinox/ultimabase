import {
	PluginError,
	Schema,
	UltimaBase,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	defineOperation,
	defineOperationTransport,
	defineOperationValue,
	definePlugin,
	operationHandler,
	operationTransportBinding,
	operationWireCodec,
	provideCapability,
	provideOperationHandler,
	provideOperationTransportBinding,
	type DatabaseAdapter,
	type DatabaseOperationAst,
	type DatabaseOperationRequest,
	type DatabaseOperationResult,
	type DatabaseTransactionAdapter,
	type JsonValue,
	type OperationTransportBindingDefinition,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { graphql, printSchema } from 'graphql'
import { describe, expect, it } from 'vitest'

import { graphqlPlugin } from './plugin.js'
import { graphqlOperationProtocol } from './protocol.js'

class OperationDatabase implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly capabilities = {
		persistencePlans: databasePersistencePlanCapability,
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		void request
		return Promise.reject(new TypeError('Operation fixture does not persist'))
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
		return Promise.reject(new TypeError('Operation fixture does not mutate'))
	}
}

const databasePlugin = definePlugin({
	capabilities: {
		provides: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database',
				create: () => ({ value: new OperationDatabase() }),
			}),
		],
	},
	core: '^0.0.0',
	pluginId: 'fixture.graphql-operation-database',
	version: '1.0.0',
})

const input = defineOperationValue((value: unknown, path) => {
	if (
		!isPlainRecord(value) ||
		Object.keys(value).length !== 1 ||
		typeof value.message !== 'string'
	) {
		throw new TypeError(`${path} must contain exactly message`)
	}
	return immutableRecord({ message: value.message })
})
const result = defineOperationValue((value: unknown, path) => {
	if (
		!isPlainRecord(value) ||
		Object.keys(value).length !== 2 ||
		typeof value.message !== 'string' ||
		typeof value.requestId !== 'string'
	) {
		throw new TypeError(`${path} must contain message and requestId`)
	}
	return immutableRecord({ message: value.message, requestId: value.requestId })
})
const echoOperation = defineOperation({
	errors: ['ECHO_REJECTED'] as const,
	input,
	name: 'fixture.graphql-operation.echo',
	result,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})
const privateOperation = defineOperation({
	input,
	name: 'fixture.graphql-operation.private',
	result,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})

const echoMetadata = immutableRecord({
	field: 'echo',
	input: immutableRecord({
		kind: 'non-null',
		ofType: immutableRecord({ kind: 'named', name: 'EchoInput' }),
	}),
	kind: 'graphql-operation-binding',
	result: immutableRecord({
		kind: 'non-null',
		ofType: immutableRecord({ kind: 'named', name: 'EchoPayload' }),
	}),
	root: 'mutation',
	types: [
		{
			fields: [
				{
					name: 'message',
					type: {
						kind: 'non-null',
						ofType: { kind: 'named', name: 'String' },
					},
				},
			],
			kind: 'input-object',
			name: 'EchoInput',
		},
		{
			fields: [
				{
					name: 'message',
					type: {
						kind: 'non-null',
						ofType: { kind: 'named', name: 'String' },
					},
				},
				{
					name: 'requestId',
					type: {
						kind: 'non-null',
						ofType: { kind: 'named', name: 'String' },
					},
				},
			],
			kind: 'object',
			name: 'EchoPayload',
		},
	],
} as const)

const createBinding = (
	metadata: JsonValue = echoMetadata,
): OperationTransportBindingDefinition =>
	operationTransportBinding({
		codec: operationWireCodec({
			decode: (wire: unknown) => input.snapshot(wire, 'echo.wire-input'),
			encode: (value) =>
				immutableRecord({
					message: value.message.toUpperCase(),
					requestId: value.requestId,
				}),
			operation: echoOperation,
			transport: graphqlOperationProtocol,
		}),
		metadata,
		operation: echoOperation,
	})

const createOperationPlugin = (
	options: {
		binding?: OperationTransportBindingDefinition | false
		declare?: boolean
	} = {},
) => {
	const binding = options.binding ?? createBinding()
	return definePlugin({
		capabilities: {
			provides: [
				provideOperationHandler({
					contributionId: 'echo-handler',
					create: () => ({
						value: operationHandler({
							execute: ({ context, input: operationInput }) => {
								if (operationInput.message === 'reject') {
									throw new PluginError(
										'ECHO_REJECTED',
										'Private echo rejection details.',
										{ publicMessage: 'Echo rejected.' },
									)
								}
								return immutableRecord({
									message: operationInput.message,
									requestId: context.requestId,
								})
							},
							operation: echoOperation,
						}),
					}),
				}),
				...(binding === false
					? []
					: [
							provideOperationTransportBinding({
								contributionId: 'echo-graphql-binding',
								create: () => ({ value: binding }),
							}),
						]),
			],
		},
		core: '^0.0.0',
		declare: ({ operations }) => {
			if (options.declare !== false) operations.declare(echoOperation)
			operations.declare(privateOperation)
		},
		pluginId: 'fixture.graphql-operation-owner',
		privileges: [
			{ name: 'operation:declare', reason: 'Declares fixture operations.' },
			{ name: 'transport:expose', reason: 'Binds the GraphQL fixture.' },
		] as const,
		version: '1.0.0',
	})
}

const RecordSchema = Schema.define({
	className: 'GraphqlOperationRecord',
	fields: (field) => ({ value: field.string() }),
})

const createStartedFixture = async () => {
	const ultimabase = new UltimaBase({
		pluginPrivileges: { logger: false },
		plugins: [
			databasePlugin,
			createOperationPlugin(),
			graphqlPlugin({
				acknowledgeUnverifiedProtection: true,
				operations: [echoOperation],
			}),
		],
		schemas: [RecordSchema],
	})
	await ultimabase.start()
	return ultimabase
}

describe('GraphQL plugin operations', () => {
	it('compiles only selected operations and executes through Core codecs', async () => {
		const ultimabase = await createStartedFixture()
		const application = ultimabase.application.getPlugin(
			'@ultimabase/graphql-plugin',
		)
		const schemaText = printSchema(application.schema)
		expect(schemaText).toContain('echo(input: EchoInput!): EchoPayload!')
		expect(schemaText).not.toContain('private')
		const context = ultimabase.engine.anonymous({
			requestId: 'graphql-operation-1',
			source: 'ultimabase.graphql',
		}).context

		const response = await graphql({
			contextValue: { request: context },
			schema: application.schema,
			source:
				'mutation Echo($input: EchoInput!) { echo(input: $input) { message requestId } }',
			variableValues: { input: { message: 'hello' } },
		})
		expect(response).toMatchObject({
			data: {
				echo: { message: 'HELLO', requestId: 'graphql-operation-1' },
			},
		})
		expect(response.errors).toBeUndefined()
		const malformed = await graphql({
			contextValue: { request: context },
			schema: application.schema,
			source:
				'mutation Echo($input: EchoInput!) { echo(input: $input) { message } }',
			variableValues: { input: {} },
		})
		expect(malformed.data).toBeUndefined()
		expect(malformed.errors?.[0]?.message).toContain('required field "message"')
		await ultimabase.dispose()
	})

	it('preserves safe plugin failures, cancellation, and application lifetime', async () => {
		const ultimabase = await createStartedFixture()
		const application = ultimabase.application.getPlugin(
			'@ultimabase/graphql-plugin',
		)
		const schema = application.schema
		const source =
			'mutation Echo($input: EchoInput!) { echo(input: $input) { message } }'
		const rejectedContext = ultimabase.engine.anonymous({
			requestId: 'graphql-operation-rejected',
			source: 'ultimabase.graphql',
		}).context
		const rejected = await graphql({
			contextValue: { request: rejectedContext },
			schema,
			source,
			variableValues: { input: { message: 'reject' } },
		})
		expect(rejected.errors?.[0]).toMatchObject({
			extensions: {
				code: 'ECHO_REJECTED',
				requestId: 'graphql-operation-rejected',
			},
			message: 'Echo rejected.',
		})
		expect(JSON.stringify(rejected)).not.toContain('Private echo')

		const controller = new AbortController()
		const cancelledContext = ultimabase.engine.anonymous({
			requestId: 'graphql-operation-cancelled',
			signal: controller.signal,
			source: 'ultimabase.graphql',
		}).context
		controller.abort('client disconnected')
		const cancelled = await graphql({
			contextValue: { request: cancelledContext },
			schema,
			source,
			variableValues: { input: { message: 'hello' } },
		})
		expect(cancelled.errors?.[0]?.extensions).toMatchObject({
			requestId: 'graphql-operation-cancelled',
		})
		const foreign = await createStartedFixture()
		try {
			const foreignContext = foreign.engine.anonymous({
				requestId: 'graphql-operation-foreign',
				source: 'ultimabase.graphql',
			}).context
			const foreignResult = await graphql({
				contextValue: { request: foreignContext },
				schema,
				source,
				variableValues: { input: { message: 'hello' } },
			})
			expect(foreignResult.data).toBeNull()
			expect(foreignResult.errors).toHaveLength(1)
		} finally {
			await foreign.dispose()
		}

		await ultimabase.dispose()
		const disposed = await graphql({
			contextValue: { request: rejectedContext },
			schema,
			source,
			variableValues: { input: { message: 'hello' } },
		})
		expect(disposed.errors?.[0]).toMatchObject({
			extensions: { code: 'INTERNAL_SERVER_ERROR' },
			message: 'Unexpected error.',
		})
	})

	it('rejects missing, foreign, malformed, and colliding bindings', async () => {
		for (const pluginId of [
			'@ultimabase/graphql-plugin',
			'fixture.graphql-operation-owner',
		]) {
			expect(
				() =>
					new UltimaBase({
						pluginPrivileges: {
							logger: false,
							plugins: {
								[pluginId]: { deny: ['transport:expose'] },
							},
						},
						plugins: [
							databasePlugin,
							createOperationPlugin(),
							graphqlPlugin({ operations: [echoOperation] }),
						],
						schemas: [RecordSchema],
					}),
			).toThrow('denied 1 active request')
		}
		await expect(
			new UltimaBase({
				pluginPrivileges: { logger: false },
				plugins: [
					databasePlugin,
					createOperationPlugin({ binding: false }),
					graphqlPlugin({ operations: [echoOperation] }),
				],
				schemas: [RecordSchema],
			}).start(),
		).rejects.toThrow('requires one exact binding')

		const ownerWithoutBinding = createOperationPlugin({ binding: false })
		const foreignBinding = definePlugin({
			capabilities: {
				provides: [
					provideOperationTransportBinding({
						contributionId: 'foreign-binding',
						create: () => ({ value: createBinding() }),
					}),
				],
			},
			core: '^0.0.0',
			pluginId: 'fixture.graphql-operation-foreign',
			privileges: [
				{ name: 'transport:expose', reason: 'Exercises owner rejection.' },
			] as const,
			version: '1.0.0',
		})
		await expect(
			new UltimaBase({
				pluginPrivileges: { logger: false },
				plugins: [
					databasePlugin,
					ownerWithoutBinding,
					foreignBinding,
					graphqlPlugin({ operations: [echoOperation] }),
				],
				schemas: [RecordSchema],
			}).start(),
		).rejects.toThrow('not owned by its declaration owner')

		const incompatibleProtocol = defineOperationTransport({
			name: graphqlOperationProtocol.name,
			version: '2.0.0',
		})
		const incompatibleBinding = operationTransportBinding({
			codec: operationWireCodec({
				decode: (wire: unknown) => input.snapshot(wire, 'echo.wire-input'),
				encode: (value) => value,
				operation: echoOperation,
				transport: incompatibleProtocol,
			}),
			metadata: echoMetadata,
			operation: echoOperation,
		})
		await expect(
			new UltimaBase({
				pluginPrivileges: { logger: false },
				plugins: [
					databasePlugin,
					createOperationPlugin({ binding: incompatibleBinding }),
					graphqlPlugin({ operations: [echoOperation] }),
				],
				schemas: [RecordSchema],
			}).start(),
		).rejects.toThrow('requires one exact binding')

		for (const [metadata, message] of [
			[{ ...echoMetadata, extra: true }, 'contains unknown key'],
			[
				{
					...echoMetadata,
					types: [...echoMetadata.types, echoMetadata.types[0]],
				},
				'repeats type EchoInput',
			],
			[
				{
					...echoMetadata,
					types: [
						...echoMetadata.types,
						{
							fields: echoMetadata.types[1].fields,
							kind: 'object',
							name: 'GraphqlOperationRecord',
						},
					],
				},
				'conflicts with schema GraphqlOperationRecord',
			],
			[{ ...echoMetadata, field: 'createGraphqlOperationRecord' }, 'collides'],
		] as const) {
			await expect(
				new UltimaBase({
					pluginPrivileges: { logger: false },
					plugins: [
						databasePlugin,
						createOperationPlugin({ binding: createBinding(metadata) }),
						graphqlPlugin({ operations: [echoOperation] }),
					],
					schemas: [RecordSchema],
				}).start(),
			).rejects.toThrow(message)
		}
	})
})
