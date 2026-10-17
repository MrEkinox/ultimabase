import { onTestFinished, describe, expect, it } from 'vitest'
import {
	PluginError,
	UltimaBase,
	defineOperationTransport,
	operationTransportBinding,
	operationWireCodec,
	type JsonValue,
	type OperationTransportBindingDefinition,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { graphql, printSchema } from 'graphql'

import { graphqlPlugin } from './plugin.js'
import { graphqlOperationProtocol } from './protocol.js'
import {
	anonymous,
	contributeOperation,
	contributeOperationBinding,
	defineOperation,
	defineOperationValue,
	plugin,
} from '@ultimabase/core/plugin'
import {
	ScriptedTestDatabase,
	testDatabasePlugin,
} from '../../../tooling/vitest/test-database.js'

const databasePlugin = testDatabasePlugin(
	new ScriptedTestDatabase({ description: 'Operation fixture' }),
	{ id: 'fixture.graphql-operation-database' },
)

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
			'transport:expose': 'Declares the public GraphQL fixture.',
		},
		version: '1.0.0',
		contributions: [
			contributeOperation({
				bindings: binding === false ? [] : [binding],
				// Every installed transport exposes a public operation (ADR-0325).
				public: { name: 'echo' },
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
		graphqlPlugin({ publicWrites: true }),
	))({ logger: false, schemas: [RecordSchema] })
	onTestFinished(() => ultimabase.dispose())
	await ultimabase.start()
	return ultimabase
}

describe('GraphQL plugin operations', () => {
	it('compiles public operations and executes through Core codecs', async () => {
		const ultimabase = await createStartedFixture()
		const application = ultimabase.plugin('@ultimabase/graphql-plugin')
		const schemaText = printSchema(application.schema)
		expect(schemaText).toContain('echo(input: EchoInput!): EchoPayload!')
		expect(schemaText).not.toContain('private')
		const context = anonymous(ultimabase, {
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
		const foreignContext = anonymous(foreign, {
			requestId: 'graphql-operation-foreign',
			source: 'ultimabase.graphql',
		}).context
		await foreign.dispose()
		const ultimabase = await createStartedFixture()
		const application = ultimabase.plugin('@ultimabase/graphql-plugin')
		const schema = application.schema
		const source =
			'mutation Echo($input: EchoInput!) { echo(input: $input) { message } }'
		const rejectedContext = anonymous(ultimabase, {
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
		const cancelledContext = anonymous(ultimabase, {
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
					graphqlPlugin({ publicWrites: true }),
				))({
					pluginPrivileges: {
						plugins: {
							[pluginId]: { deny: ['transport:expose'] },
						},
					},
					logger: false,
					schemas: [RecordSchema],
				})
				onTestFinished(() => application.dispose())
				return application
			}).toThrow('denied 1 active request')
		}
		// Without a GraphQL binding, a public operation takes and returns JSON,
		// validated by its own contract (ADR-0325).
		const unbound = new (UltimaBase.use(
			databasePlugin,
			createOperationPlugin({ binding: false }),
			graphqlPlugin({ publicWrites: true }),
		))({
			logger: false,
			schemas: [RecordSchema],
		})
		onTestFinished(() => unbound.dispose())
		await unbound.start()
		const unboundSchema = unbound.plugin('@ultimabase/graphql-plugin').schema
		expect(printSchema(unboundSchema)).toContain('echo(input: JSON): JSON')
		const unboundContext = anonymous(unbound, {
			requestId: 'graphql-operation-unbound',
			source: 'ultimabase.graphql',
		}).context
		await expect(
			graphql({
				contextValue: { request: unboundContext },
				schema: unboundSchema,
				source: 'mutation { echo(input: { message: "json" }) }',
			}),
		).resolves.toEqual({
			data: {
				echo: { message: 'json', requestId: 'graphql-operation-unbound' },
			},
		})
		const invalid = await graphql({
			contextValue: { request: unboundContext },
			schema: unboundSchema,
			source: 'mutation { echo(input: { other: 1 }) }',
		})
		expect(invalid.errors?.[0]?.extensions).toMatchObject({
			code: 'VALIDATION_ERROR',
		})
		await unbound.dispose()

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
				graphqlPlugin({ publicWrites: true }),
			))({
				logger: false,
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
		// A binding for another protocol version chooses that version only:
		// this one gets no default form (ADR-0341).
		const incompatible = new (UltimaBase.use(
			databasePlugin,
			createOperationPlugin({ binding: incompatibleBinding }),
			graphqlPlugin({ publicWrites: true }),
		))({
			logger: false,
			schemas: [RecordSchema],
		})
		onTestFinished(() => incompatible.dispose())
		await incompatible.start()
		expect(
			printSchema(incompatible.plugin('@ultimabase/graphql-plugin').schema),
		).not.toContain('echo(')
		await incompatible.dispose()

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
			// The owner designates no schema: `owned-schema` resolves to none.
			[
				{
					...echoMetadata,
					result: { kind: 'non-null', ofType: { kind: 'owned-schema' } },
				},
				'requires exactly one schema owned by fixture.graphql-operation',
			],
			[
				{
					...echoMetadata,
					types: [
						{
							...echoMetadata.types[0],
							createFieldsFrom: { kind: 'owned-schema' },
						},
						echoMetadata.types[1],
					],
				},
				'requires exactly one schema owned by fixture.graphql-operation',
			],
		] as const) {
			await expect(
				new (UltimaBase.use(
					databasePlugin,
					createOperationPlugin({ binding: createBinding(metadata) }),
					graphqlPlugin({ publicWrites: true }),
				))({
					logger: false,
					schemas: [RecordSchema],
				}).start(),
			).rejects.toThrow(message)
		}
	})
})
