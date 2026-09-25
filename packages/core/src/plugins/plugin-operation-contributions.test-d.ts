import { expectTypeOf, test } from 'vitest'

import {
	contributeOperation,
	contributeOperationBinding,
	contributeSchemaMutation,
	contributeSchemaMutationBinding,
	defineOperation,
	defineOperationTransport,
	defineOperationValue,
	plugin,
	defineSchemaMutation,
	operationTransportBinding,
	operationWireCodec,
	schemaMutationTransportBinding,
	schemaMutationWireCodec,
	type ApplicationCapabilityFactoryContext,
	type PluginOperationContribution,
	type PluginSchemaMutationContribution,
} from '../index.js'

const input = defineOperationValue((value) => String(value))
const result = defineOperationValue((value) => Boolean(value))
const inspect = defineOperation({
	input,
	name: 'fixture.contribution.inspect',
	result,
	target: 'application',
	transaction: 'forbidden',
	version: '1.0.0',
})
const transport = defineOperationTransport({
	name: 'fixture.contribution.transport',
	version: '1.0.0',
})
const codec = operationWireCodec({
	decode: (value: { readonly text: string }) => value.text,
	encode: (value) => ({ accepted: value }),
	operation: inspect,
	transport,
})
const binding = operationTransportBinding({ codec, operation: inspect })
const archive = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	input,
	name: 'fixture.contribution.archive',
	returning: 'after',
	version: '1.0.0',
})
const mutationCodec = schemaMutationWireCodec({
	decode: (value: { readonly text: string }) => value.text,
	mutation: archive,
	transport,
})
const mutationBinding = schemaMutationTransportBinding({
	codec: mutationCodec,
	mutation: archive,
})

test('infers direct, resource-backed, and binding-only contributions', () => {
	const direct = contributeOperation({
		bindings: [binding],
		execute: ({ input: operationInput }) => operationInput.length > 0,
		operation: inspect,
	})
	const resource = contributeOperation({
		create: (context) => {
			expectTypeOf(context).toEqualTypeOf<ApplicationCapabilityFactoryContext>()
			return {
				dispose: () => undefined,
				execute: ({ input: operationInput }) => operationInput.length > 0,
			}
		},
		operation: inspect,
	})
	const externalBinding = contributeOperationBinding(binding)

	expectTypeOf(direct).toEqualTypeOf<
		PluginOperationContribution<typeof inspect, readonly [typeof binding]>
	>()
	expectTypeOf(resource.operation).toEqualTypeOf<typeof inspect>()
	expectTypeOf(externalBinding.binding).toEqualTypeOf<typeof binding>()
})

test('accepts operation contributions directly in the Core plugin factory', () => {
	const definition = plugin({
		core: '^0.0.0',
		id: 'fixture.operation-module',
		version: '1.0.0',
		contributions: [
			contributeOperation({
				execute: ({ input: operationInput }) => operationInput.length > 0,
				operation: inspect,
			}),
		],
		permissions: {
			'operation:declare': 'Declares the fixture operation.',
		},
	})

	expectTypeOf(
		definition.manifest.identity.pluginId,
	).toEqualTypeOf<'fixture.operation-module'>()
})

test('infers schema-mutation contributions through the same Core factory', () => {
	const direct = contributeSchemaMutation({
		bindings: [mutationBinding],
		mutation: archive,
		resolve: () => ({ data: { workflowState: 'archived' } }),
	})
	const resource = contributeSchemaMutation({
		create: (context) => {
			expectTypeOf(context).toEqualTypeOf<ApplicationCapabilityFactoryContext>()
			return {
				dispose: () => undefined,
				resolve: () => ({ data: { workflowState: 'archived' } }),
			}
		},
		mutation: archive,
	})
	const externalBinding = contributeSchemaMutationBinding(mutationBinding)

	expectTypeOf(direct).toEqualTypeOf<
		PluginSchemaMutationContribution<
			typeof archive,
			readonly [typeof mutationBinding]
		>
	>()
	expectTypeOf(resource.mutation).toEqualTypeOf<typeof archive>()
	expectTypeOf(externalBinding.binding).toEqualTypeOf<typeof mutationBinding>()
})

test('rejects handlers whose results do not match the operation', () => {
	contributeOperation({
		// @ts-expect-error -- The handler must return the exact logical result.
		execute: () => 'invalid',
		operation: inspect,
	})
})
