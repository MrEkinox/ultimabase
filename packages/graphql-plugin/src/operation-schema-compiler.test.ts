import { onTestFinished, describe, expect, it } from 'vitest'
import {
	PluginError,
	UltimaBase,
	contributeOperation,
	contributeOperationBinding,
	databaseAdapterCapability,
	databasePersistencePlanCapability,
	defineOperation,
	defineOperationTransport,
	defineOperationValue,
	plugin,
	operationTransportBinding,
	operationWireCodec,
	provideCapability,
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

import { graphqlPlugin } from './plugin.js'
import { graphqlOperationProtocol } from './protocol.js'

class OperationDatabase implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly checkHealth = (): Promise<void> => Promise.resolve()
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

const databasePlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.graphql-operation-database',
	version: '1.0.0',
	contributions: [
		provideCapability(databaseAdapterCapability, {
			contributionId: 'database',
			create: () => ({ value: new OperationDatabase() }),
		}),
	],
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
): OperationTransportBindingDefinition<typeof echoOperation> =>
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
		binding?: OperationTransportBindingDefinition<typeof echoOperation> | false
	} = {},
) => {
	const binding = options.binding ?? createBinding()
	return plugin({
		core: '^0.0.0',
		id: 'fixture.graphql-operation-owner',
		permissions: {
			'operation:declare': 'Declares fixture operations.',
			...(binding === false
				? {}
				: { 'transport:expose': 'Binds the GraphQL fixture.' }),
		},
		version: '1.0.0',
		contributions: [
			contributeOperation({
				bindings: binding === false ? [] : [binding],
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
		],
	})
}

const RecordSchema = UltimaBase.Schema.define({
	className: 'GraphqlOperationRecord',
	fields: (field) => ({ value: field.string() }),
})

const createStartedFixture = async () => {
	const ultimabase = new (UltimaBase.use(
		databasePlugin,
		createOperationPlugin(),
		graphqlPlugin({
			acknowledgeUnverifiedProtection: true,
			operations: [echoOperation],
		}),
	))({ pluginPrivileges: { logger: false }, schemas: [RecordSchema] })
	onTestFinished(() => ultimabase.dispose())
	await ultimabase.start()
	return ultimabase
}

describe('GraphQL plugin operations', () => {
	it('compiles only selected operations and executes through Core codecs', async () => {
		const ultimabase = await createStartedFixture()
		const application = ultimabase.plugin('@ultimabase/graphql-plugin')
		const schemaText = printSchema(application.schema)
		expect(schemaText).toContain('echo(input: EchoInput!): EchoPayload!')
		expect(schemaText).not.toContain('private')
		const context = ultimabase.anonymous({
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
		const foreign = await createStartedFixture()
		const foreignContext = foreign.anonymous({
			requestId: 'graphql-operation-foreign',
			source: 'ultimabase.graphql',
		}).context
		await foreign.dispose()
		const ultimabase = await createStartedFixture()
		const application = ultimabase.plugin('@ultimabase/graphql-plugin')
		const schema = application.schema
		const source =
			'mutation Echo($input: EchoInput!) { echo(input: $input) { message } }'
		const rejectedContext = ultimabase.anonymous({
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
		const cancelledContext = ultimabase.anonymous({
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

		try {
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
			expect(() => {
				const application = new (UltimaBase.use(
					databasePlugin,
					createOperationPlugin(),
					graphqlPlugin({ operations: [echoOperation] }),
				))({
					pluginPrivileges: {
						logger: false,
						plugins: {
							[pluginId]: { deny: ['transport:expose'] },
						},
					},
					schemas: [RecordSchema],
				})
				onTestFinished(() => application.dispose())
				return application
			}).toThrow('denied 1 active request')
		}
		await expect(
			new (UltimaBase.use(
				databasePlugin,
				createOperationPlugin({ binding: false }),
				graphqlPlugin({ operations: [echoOperation] }),
			))({
				pluginPrivileges: { logger: false },
				schemas: [RecordSchema],
			}).start(),
		).rejects.toThrow('requires one exact binding')

		const ownerWithoutBinding = createOperationPlugin({ binding: false })
		const foreignBinding = plugin({
			core: '^0.0.0',
			id: 'fixture.graphql-operation-foreign',
			permissions: { 'transport:expose': 'Exercises owner rejection.' },
			version: '1.0.0',
			contributions: [contributeOperationBinding(createBinding())],
		})
		await expect(
			new (UltimaBase.use(
				databasePlugin,
				ownerWithoutBinding,
				foreignBinding,
				graphqlPlugin({ operations: [echoOperation] }),
			))({
				pluginPrivileges: { logger: false },
				schemas: [RecordSchema],
			}).start(),
			// Core rejects the foreign provider before GraphQL receives its inert plan.
		).rejects.toMatchObject({
			code: 'PLUGIN_OPERATION_INVALID',
			internalDetails: { kind: 'operation-transport-owner-invalid' },
		})

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
			new (UltimaBase.use(
				databasePlugin,
				createOperationPlugin({ binding: incompatibleBinding }),
				graphqlPlugin({ operations: [echoOperation] }),
			))({
				pluginPrivileges: { logger: false },
				schemas: [RecordSchema],
			}).start(),
		).rejects.toThrow('requires one exact binding')

		for (const [metadata, message] of [
			[{ ...echoMetadata, extra: true }, 'contains unknown key'],
			...['MissingSchema', 'GraphqlOperationRecord'].map(
				(createFieldsFrom) =>
					[
						{
							...echoMetadata,
							types: [
								{ ...echoMetadata.types[0], createFieldsFrom },
								echoMetadata.types[1],
							],
						},
						'cannot use create fields from',
					] as const,
			),
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
				new (UltimaBase.use(
					databasePlugin,
					createOperationPlugin({ binding: createBinding(metadata) }),
					graphqlPlugin({ operations: [echoOperation] }),
				))({
					pluginPrivileges: { logger: false },
					schemas: [RecordSchema],
				}).start(),
			).rejects.toThrow(message)
		}
	})
})
