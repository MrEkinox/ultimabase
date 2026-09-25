import {
	contributeOperation,
	defineOperation,
	defineOperationTransport,
	defineOperationValue,
	plugin,
	operationTransportBinding,
	operationWireCodec,
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
	plugin({
		core: '^0.0.0',
		contributions: [
			contributeOperation({
				bindings: [binding],
				execute: () => null,
				operation: publicTransportDiagnosticOperation,
			}),
		],
		id: 'fixture.public-transport-protection.operations',
		permissions: {
			'operation:declare':
				'Declares the public transport diagnostic operation.',
			'transport:expose': 'Binds the public transport diagnostic protocol.',
		},
		version: '1.0.0',
	})
