import {
	defineOperationTransport,
	operationTransportBinding,
	operationWireCodec,
} from '@ultimabase/core'
import {
	defineOperation,
	defineOperationValue,
	plugin,
	contributeOperation,
} from '@ultimabase/core/plugin'
import { passwordPrincipal } from '@ultimabase/password-auth-plugin'

const statusInput = defineOperationValue((value, path): null => {
	if (value !== null) throw new TypeError(`${path} must be null`)
	return null
})

const statusResult = defineOperationValue(
	(
		value,
		path,
	): Readonly<{
		readonly authority: 'anonymous' | 'master'
		readonly principalId: string | null
	}> => {
		if (
			typeof value !== 'object' ||
			value === null ||
			!('authority' in value) ||
			(value.authority !== 'anonymous' && value.authority !== 'master') ||
			!('principalId' in value) ||
			(value.principalId !== null && typeof value.principalId !== 'string')
		) {
			throw new TypeError(
				`${path} must contain safe authority and principal data`,
			)
		}
		return Object.freeze({
			authority: value.authority,
			principalId: value.principalId,
		})
	},
)

/** The one application operation deliberately exposed by the example. */
export const exampleStatusOperation = defineOperation({
	errors: [],
	input: statusInput,
	name: 'example.status',
	result: statusResult,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})

const restProtocol = defineOperationTransport({
	name: 'ultimabase.rest',
	version: '1.0.0',
})
const graphqlProtocol = defineOperationTransport({
	name: 'ultimabase.graphql.operation',
	version: '1.0.0',
})
const statusCodec = operationWireCodec({
	decode: (value): null => {
		if (value !== null) throw new TypeError('REST status input must be null')
		return null
	},
	encode: (value) =>
		Object.freeze({
			authority: value.authority,
			principalId: value.principalId,
		}),
	operation: exampleStatusOperation,
	transport: restProtocol,
})
const statusGraphqlCodec = operationWireCodec({
	decode: (value): null => {
		if (value !== null) throw new TypeError('GraphQL status input must be null')
		return null
	},
	encode: (value) =>
		Object.freeze({
			authority: value.authority,
			principalId: value.principalId,
		}),
	operation: exampleStatusOperation,
	transport: graphqlProtocol,
})
const statusGraphqlBinding = operationTransportBinding({
	codec: statusGraphqlCodec,
	metadata: {
		field: 'status',
		kind: 'graphql-operation-binding',
		result: {
			kind: 'non-null',
			ofType: { kind: 'named', name: 'ExampleStatusPayload' },
		},
		root: 'query',
		types: [
			{
				fields: [
					{
						name: 'authority',
						type: {
							kind: 'non-null',
							ofType: { kind: 'named', name: 'String' },
						},
					},
					{
						name: 'principalId',
						type: { kind: 'named', name: 'ID' },
					},
				],
				kind: 'object',
				name: 'ExampleStatusPayload',
			},
		],
	},
	operation: exampleStatusOperation,
})

/**
 * Owns the operation handler, declares it public (every installed transport
 * exposes it, ADR-0324) and binds its REST and GraphQL wire formats.
 */
export const exampleStatusPlugin = plugin({
	contributions: [
		contributeOperation({
			public: { name: 'status' },
			bindings: [
				operationTransportBinding({
					codec: statusCodec,
					metadata: { errors: {} },
					operation: exampleStatusOperation,
				}),
				statusGraphqlBinding,
			],
			execute: ({ context }) =>
				Object.freeze({
					authority: context.access.mode,
					principalId: context.getValue(passwordPrincipal)?.user.id ?? null,
				}),
			operation: exampleStatusOperation,
		}),
	],
	core: '^0.0.0',
	id: 'example.status-plugin',
	version: '1.0.0',
})
