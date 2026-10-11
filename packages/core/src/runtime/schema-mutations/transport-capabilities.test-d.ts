import { expectTypeOf, test } from 'vitest'

import {
	defineOperationTransport,
	schemaMutationTransportBinding,
	schemaMutationWireCodec,
	type SchemaMutationTransportBindingMetadata,
	type SchemaMutationTransportWireInput,
} from '../../index.js'
import { defineOperationValue, defineSchemaMutation } from '../../plugin.js'

const mutation = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	input: defineOperationValue(
		(value): Readonly<{ readonly reason: string }> =>
			value as Readonly<{ readonly reason: string }>,
	),
	name: 'fixture.schema-mutation-transport.typed',
	returning: 'after',
	version: '1.0.0',
})
const transport = defineOperationTransport({
	name: 'fixture.schema-mutation-transport.typed-protocol',
	version: '1.0.0',
})
const codec = schemaMutationWireCodec({
	decode: (value: Readonly<{ readonly message: string }>) => ({
		reason: value.message,
	}),
	mutation,
	transport,
})
const binding = schemaMutationTransportBinding({
	codec,
	metadata: { errors: { rejected: 409 } } as const,
	mutation,
})

test('retains exact schema mutation wire and metadata types', () => {
	expectTypeOf(binding).not.toBeAny()
	expectTypeOf<
		SchemaMutationTransportWireInput<typeof binding>
	>().toEqualTypeOf<Readonly<{ readonly message: string }>>()
	expectTypeOf<
		SchemaMutationTransportBindingMetadata<typeof binding>
	>().toEqualTypeOf<Readonly<{ readonly errors: { readonly rejected: 409 } }>>()
})
