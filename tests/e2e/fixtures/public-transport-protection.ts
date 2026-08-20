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

const emptyValue = defineOperationValue((value, path): null => {
	if (value !== null) throw new TypeError(`${path} must be null`)
	return null
})

export const publicTransportDiagnosticOperation = defineOperation({
	input: emptyValue,
	name: 'fixture.public-transport-protection.inspect',
	result: emptyValue,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})

export const publicTransportDiagnosticProtocol = defineOperationTransport({
	name: 'fixture.public-transport-protection.fake',
	version: '1.0.0',
})

const codec = operationWireCodec({
	decode: (value: null) => value,
	encode: (value) => value,
	operation: publicTransportDiagnosticOperation,
	transport: publicTransportDiagnosticProtocol,
})
const binding = operationTransportBinding({
	codec,
	operation: publicTransportDiagnosticOperation,
})

/** Declares one public operation and wire binding through package-root APIs. */
export const createPublicTransportDiagnosticPlugin = () =>
	definePlugin({
		capabilities: {
			provides: [
				provideOperationHandler({
					contributionId: 'handler',
					create: () => ({
						value: operationHandler({
							execute: () => null,
							operation: publicTransportDiagnosticOperation,
						}),
					}),
				}),
				provideOperationTransportBinding({
					contributionId: 'binding',
					create: () => ({ value: binding }),
				}),
			],
		},
		core: '^0.0.0',
		declare: ({ operations }) => {
			operations.declare(publicTransportDiagnosticOperation)
		},
		pluginId: 'fixture.public-transport-protection.operations',
		privileges: [
			{
				name: 'operation:declare',
				reason: 'Declares the public transport diagnostic operation.',
			},
			{
				name: 'transport:expose',
				reason: 'Binds the public transport diagnostic protocol.',
			},
		],
		version: '1.0.0',
	})
