import {
	defineOperation,
	defineOperationTransport,
	defineOperationValue,
	definePlugin,
	operationHandler,
	operationTransportBinding,
	operationWireCodec,
	provideOperationHandler,
	provideOperationTransportBinding,
} from '@ultimabase/core'

const statusInput = defineOperationValue((value, path): null => {
	if (value !== null) throw new TypeError(`${path} must be null`)
	return null
})

const statusResult = defineOperationValue(
	(value, path): Readonly<{ readonly authority: 'anonymous' | 'master' }> => {
		if (
			typeof value !== 'object' ||
			value === null ||
			!('authority' in value) ||
			(value.authority !== 'anonymous' && value.authority !== 'master')
		) {
			throw new TypeError(`${path}.authority must name a Core authority mode`)
		}
		return Object.freeze({ authority: value.authority })
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
const statusCodec = operationWireCodec({
	decode: (value): null => {
		if (value !== null) throw new TypeError('REST status input must be null')
		return null
	},
	encode: (value) => Object.freeze({ authority: value.authority }),
	operation: exampleStatusOperation,
	transport: restProtocol,
})

/** Owns the operation handler and its explicit REST v1 binding. */
export const exampleStatusPlugin = definePlugin({
	capabilities: {
		provides: [
			provideOperationHandler({
				contributionId: 'status-handler',
				create: () => ({
					value: operationHandler({
						execute: ({ context }) =>
							Object.freeze({ authority: context.access.mode }),
						operation: exampleStatusOperation,
					}),
				}),
			}),
			provideOperationTransportBinding({
				contributionId: 'rest-v1',
				create: () => ({
					value: operationTransportBinding({
						codec: statusCodec,
						metadata: { errors: {} },
						operation: exampleStatusOperation,
					}),
				}),
			}),
		],
	},
	core: '^0.0.0',
	declare: ({ operations }) => {
		operations.declare(exampleStatusOperation)
		return undefined
	},
	pluginId: 'example.status-plugin',
	privileges: [
		{ name: 'operation:declare', reason: 'Declares the status operation.' },
		{ name: 'transport:expose', reason: 'Exposes status through REST v1.' },
	],
	version: '1.0.0',
})
