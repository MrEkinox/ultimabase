import process from 'node:process'

import {
	RequestContext,
	PluginError,
	UltimaBase,
	databaseAdapterCapability,
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
} from '@ultimabase/core'
import { FakePublicOperationTransport } from '@ultimabase/testing'

const immutable = (value) => Object.freeze(value)
const input = defineOperationValue((value, path) => {
	if (
		typeof value !== 'object' ||
		value === null ||
		typeof value.message !== 'string'
	) {
		throw new TypeError(`${path}.message must be a string`)
	}
	return immutable({ message: value.message })
})
const result = defineOperationValue((value, path) => {
	if (
		typeof value !== 'object' ||
		value === null ||
		typeof value.echo !== 'string'
	) {
		throw new TypeError(`${path}.echo must be a string`)
	}
	return immutable({ echo: value.echo })
})
const inspect = defineOperation({
	errors: ['fixture.javascript.rejected'],
	input,
	name: 'fixture.javascript.inspect',
	result,
	target: 'application',
	transaction: 'required',
	version: '1.0.0',
})
const protocol = defineOperationTransport({
	name: 'fixture.javascript.fake',
	version: '1.0.0',
})
const handler = operationHandler({
	operation: inspect,
	execute: ({ input: value }) => {
		if (value.message === 'reject') {
			throw new PluginError(
				'fixture.javascript.rejected',
				'internal JavaScript diagnostic',
				{
					internalDetails: { secret: 'hidden' },
					publicMessage: 'Rejected by JavaScript fixture.',
				},
			)
		}
		return immutable({ echo: value.message })
	},
})
const codec = operationWireCodec({
	decode: (wire) => immutable({ message: wire.text }),
	encode: (value) => immutable({ text: value.echo }),
	operation: inspect,
	transport: protocol,
})
const binding = operationTransportBinding({ codec, operation: inspect })
const operationPlugin = definePlugin({
	capabilities: {
		provides: [
			provideOperationHandler({
				contributionId: 'handler',
				create: () => ({ value: handler }),
			}),
			provideOperationTransportBinding({
				contributionId: 'binding',
				create: () => ({ value: binding }),
			}),
		],
	},
	core: '^0.0.0',
	declare: ({ operations }) => {
		operations.declare(inspect)
	},
	pluginId: 'fixture.javascript-operations',
	privileges: [
		{ name: 'operation:declare', reason: 'Declares the JavaScript fixture.' },
		{ name: 'transport:expose', reason: 'Exposes the fake fixture binding.' },
	],
	version: '1.0.0',
})
const transaction = {
	kind: 'database-transaction-adapter',
	execute: () => Promise.reject(new Error('Unexpected database execution')),
	prepare: () => Promise.reject(new Error('Unexpected database preparation')),
	commit: () => Promise.resolve(),
	rollback: () => Promise.resolve(),
}
const adapter = {
	kind: 'database-adapter',
	execute: () => Promise.reject(new Error('Unexpected database execution')),
	beginTransaction: () => Promise.resolve(transaction),
}
const databasePlugin = definePlugin({
	capabilities: {
		provides: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'adapter',
				create: () => ({ value: adapter }),
			}),
		],
	},
	core: '^0.0.0',
	pluginId: 'fixture.javascript-database',
	version: '1.0.0',
})
const ultimabase = new UltimaBase({
	pluginPrivileges: { logger: false },
	plugins: [databasePlugin, operationPlugin],
	schemas: [],
})
await ultimabase.start()

export const directResult = await ultimabase
	.operation('fixture.javascript.inspect')
	.execute({ message: 'direct' })
const exposure = ultimabase.exposeOperations({
	operations: [inspect],
	transport: protocol,
})
const fake = new FakePublicOperationTransport(exposure)
export const transportResponse = await fake.request({
	context: RequestContext.anonymous({
		requestId: 'javascript-no-typegen',
		source: 'fixture',
	}),
	input: { text: 'transport' },
	operation: inspect.name,
	version: inspect.version,
})
export const transportErrorResponse = await fake.request({
	context: RequestContext.anonymous({
		requestId: 'javascript-no-typegen-error',
		source: 'fixture',
	}),
	input: { text: 'reject' },
	operation: inspect.name,
	version: inspect.version,
})

await ultimabase.dispose()
process.stdout.write(
	`${JSON.stringify({ directResult, transportErrorResponse, transportResponse })}\n`,
)
