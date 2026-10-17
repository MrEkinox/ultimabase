/** Fixtures of the REST plugin operation exposure tests. */
import { onTestFinished } from 'vitest'
import {
	MasterAuthority,
	PluginError,
	UltimaBase,
	defineOperationTransport,
	operationTransportBinding,
	operationWireCodec,
	type JsonValue,
	type OperationTransportProtocol,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { restPlugin } from './plugin.js'
import {
	RequestContextValue,
	contributeOperation,
	defineOperation,
	defineOperationValue,
	plugin,
} from '@ultimabase/core/plugin'
import {
	ScriptedTestDatabase,
	testDatabasePlugin,
} from '../../../tooling/vitest/test-database.js'

export const sessionValue = new RequestContextValue<
	Readonly<{ readonly id: string }>
>('fixture.rest-operation.session', (value) => {
	if (!isPlainRecord(value) || typeof value.id !== 'string') {
		throw new TypeError('session id must be a string')
	}
	return immutableRecord({ id: value.id })
})
export const inputValue = defineOperationValue((value, path) => {
	if (!isPlainRecord(value) || typeof value.message !== 'string') {
		throw new TypeError(`${path}.message must be a string`)
	}
	return immutableRecord({ message: value.message })
})
export const resultValue = defineOperationValue((value, path) => {
	if (!isPlainRecord(value) || typeof value.accepted !== 'boolean') {
		throw new TypeError(`${path}.accepted must be a boolean`)
	}
	return immutableRecord({ accepted: value.accepted })
})
export const inspectOperation = defineOperation({
	errors: ['fixture.rest-operation.rejected'] as const,
	input: inputValue,
	name: 'fixture.rest-operation.inspect',
	result: resultValue,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})

// Operation owners depend only on Core and independently name REST v1.
export const compatibleRestProtocol = defineOperationTransport({
	name: 'ultimabase.rest',
	version: '1.0.0',
})

export const createOperationPlugin = (options: {
	readonly decode?: (value: unknown) => Readonly<{ readonly message: string }>
	readonly metadata?: JsonValue
	readonly omitBinding?: boolean
	readonly private?: boolean
	readonly transport?: OperationTransportProtocol
}) => {
	const transport = options.transport ?? compatibleRestProtocol
	const codec = operationWireCodec({
		decode:
			options.decode ??
			((value: unknown) => {
				if (!isPlainRecord(value) || typeof value.text !== 'string') {
					throw new TypeError('wire input must contain text')
				}
				return immutableRecord({ message: value.text })
			}),
		encode: (value) => immutableRecord({ ok: value.accepted }),
		operation: inspectOperation,
		transport,
	})
	const binding = operationTransportBinding({
		codec,
		metadata:
			options.metadata ??
			immutableRecord({
				errors: immutableRecord({
					'fixture.rest-operation.rejected': 409,
				}),
			}),
		operation: inspectOperation,
	})
	return plugin({
		core: '^0.0.0',
		id: 'fixture.rest-operation.owner',
		permissions: {
			'operation:declare': 'Declares the fixture operation.',
			...(options.omitBinding === true
				? {}
				: { 'transport:expose': 'Binds REST v1 explicitly.' }),
		},
		version: '1.0.0',
		contributions: [
			contributeOperation({
				...(options.private === true ? {} : { public: { name: 'inspect' } }),
				bindings: options.omitBinding === true ? [] : [binding],
				execute: ({ context, input }) => {
					if (input.message === 'reject') {
						throw new PluginError(
							'fixture.rest-operation.rejected',
							'internal operation detail',
							{ publicMessage: 'Operation rejected.' },
						)
					}
					return immutableRecord({
						accepted:
							context.access.mode === 'master' ||
							context.getValue(sessionValue)?.id === 'session-1' ||
							input.message === 'anonymous',
					})
				},
				operation: inspectOperation,
			}),
		],
	})
}

export const databasePlugin = testDatabasePlugin(
	new ScriptedTestDatabase({
		capabilities: {},
		description: 'REST operation fixture',
	}),
	{ id: 'fixture.rest-operation.database' },
)

export const createFixture = async (
	options: {
		readonly bindingMetadata?: JsonValue
		readonly decode?: (value: unknown) => Readonly<{ readonly message: string }>
		readonly expose?: boolean
		readonly masterKey?: string
		readonly omitBinding?: boolean
		readonly transport?: OperationTransportProtocol
	} = {},
) => {
	const operationPlugin = createOperationPlugin({
		...(options.bindingMetadata === undefined
			? {}
			: { metadata: options.bindingMetadata }),
		...(options.decode === undefined ? {} : { decode: options.decode }),
		...(options.omitBinding === undefined
			? {}
			: { omitBinding: options.omitBinding }),
		...(options.transport === undefined
			? {}
			: { transport: options.transport }),
		...(options.expose === false ? { private: true } : {}),
	})
	const ultimabase = new (UltimaBase.use(
		databasePlugin,
		operationPlugin,
		restPlugin(),
	))({
		...(options.masterKey === undefined
			? {}
			: {
					masterAuthority: new MasterAuthority({
						keys: [{ id: 'fixture', value: options.masterKey }],
						onUse: () => undefined,
					}),
				}),
		logger: false,
		schemas: [],
	})
	onTestFinished(() => ultimabase.dispose())
	await ultimabase.start()
	const rest = ultimabase.plugin('@ultimabase/rest-plugin')
	return { rest, ultimabase }
}

export const request = (input: unknown, signal?: AbortSignal): Request =>
	new Request('https://example.test/api/operations/test', {
		body: JSON.stringify({ input }),
		headers: { 'content-type': 'application/json' },
		method: 'POST',
		...(signal === undefined ? {} : { signal }),
	})
