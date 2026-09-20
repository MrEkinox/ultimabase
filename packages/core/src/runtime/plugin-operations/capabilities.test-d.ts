import { immutableRecord } from '@ultimabase/shared'
import { expectTypeOf, test } from 'vitest'

import type { MasterRequestAccess } from '../../access/index.js'
import {
	defineOperation,
	defineOperationValue,
	type PluginOperationErrorCode,
} from '../../plugins/plugin-operations.js'
import type { JsonValue } from '../../schema/index.js'
import type { AdapterAccess } from '../adapters/raw-access.js'
import type { RequestContext } from '../context/request-context.js'
import type { RequestEngine } from '../engine/framework-engine.js'
import {
	defineOperationTransport,
	operationHandler,
	operationTransportBinding,
	operationWireCodec,
	provideOperationHandler,
	provideOperationTransportBinding,
} from './capabilities.js'
import type {
	OperationTransportBindingMetadata,
	OperationTransportWireInput,
	OperationTransportWireResult,
} from './contracts.js'
import type {
	ApplicationOperationTransport,
	OperationTransportExposureOptions,
	OperationTransportRequest,
} from './transport.js'

const input = defineOperationValue((value: unknown) => {
	if (typeof value !== 'string') throw new TypeError('input must be a string')
	return value
})
const result = defineOperationValue((value: unknown) => {
	if (typeof value !== 'number') throw new TypeError('result must be a number')
	return value
})
const operation = defineOperation({
	errors: ['fixture.typed.rejected'] as const,
	input,
	name: 'fixture.typed.inspect',
	result,
	target: 'application',
	transaction: 'optional',
	version: '1.0.0',
})
declare const exposure: ApplicationOperationTransport
declare const masterContext: RequestContext<MasterRequestAccess>

test('infers exact handler and wire boundary contracts', () => {
	const handler = operationHandler({
		operation,
		execute: ({ adapters, engine, input: value, target }) => {
			expectTypeOf(adapters).toEqualTypeOf<AdapterAccess>()
			expectTypeOf(engine).toEqualTypeOf<RequestEngine>()
			expectTypeOf(value).toEqualTypeOf<string>()
			expectTypeOf(target.kind).toEqualTypeOf<'application'>()
			return value.length
		},
	})
	const transport = defineOperationTransport({
		name: 'fixture.typed.transport',
		version: '1.0.0',
	})
	const codec = operationWireCodec({
		decode: (wire: Readonly<{ readonly value: string }>) => wire.value,
		encode: (value) => immutableRecord({ value }),
		operation,
		transport,
	})
	const binding = operationTransportBinding({
		codec,
		metadata: { errors: { 'fixture.typed.rejected': 409 } } as const,
		operation,
	})
	const acknowledgedExposure: OperationTransportExposureOptions<
		typeof transport
	> = {
		acknowledgeUnverifiedProtection: true,
		operations: [operation],
		transport,
	}
	expectTypeOf(
		acknowledgedExposure.acknowledgeUnverifiedProtection,
	).toEqualTypeOf<true | undefined>()

	expectTypeOf<OperationTransportWireInput<typeof binding>>().toEqualTypeOf<
		Readonly<{ readonly value: string }>
	>()
	expectTypeOf<OperationTransportWireResult<typeof binding>>().toEqualTypeOf<
		Readonly<{ readonly value: number }>
	>()
	expectTypeOf<
		OperationTransportBindingMetadata<typeof binding>
	>().toEqualTypeOf<{
		readonly errors: { readonly 'fixture.typed.rejected': 409 }
	}>()
	expectTypeOf(exposure.operations[0]?.metadata).toEqualTypeOf<
		JsonValue | undefined
	>()
	expectTypeOf<
		PluginOperationErrorCode<typeof operation>
	>().toEqualTypeOf<'fixture.typed.rejected'>()
	provideOperationHandler({
		contributionId: 'handler',
		create: () => ({ value: handler }),
	})
	provideOperationTransportBinding({
		contributionId: 'binding',
		create: () => ({ value: binding }),
	})
	const masterRequest: OperationTransportRequest = {
		context: masterContext,
		input: {},
		operation: operation.name,
		version: operation.version,
	}
	void exposure.execute(masterRequest)
})
