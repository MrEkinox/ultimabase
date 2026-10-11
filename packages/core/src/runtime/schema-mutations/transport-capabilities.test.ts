import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { contributeSchemaMutation } from '../../plugins/plugin-command-contributions.js'
import { defineOperationValue } from '../../plugins/plugin-operations.js'
import { plugin } from '../../plugins/plugin.js'
import { defineSchemaMutation } from '../../plugins/plugin-schema-mutations.js'
import { defineOperationTransport } from '../plugin-operations/capabilities.js'
import {
	schemaMutationTransportBinding,
	schemaMutationWireCodec,
} from './transport-capabilities.js'

const mutation = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	input: defineOperationValue((value) => value),
	name: 'fixture.schema-mutation-transport.archive',
	returning: 'after',
	version: '1.0.0',
})
const transport = defineOperationTransport({
	name: 'fixture.schema-mutation-transport.protocol',
	version: '1.0.0',
})
const codec = schemaMutationWireCodec({
	decode: (value: string) => immutableRecord({ reason: value }),
	mutation,
	transport,
})
const binding = schemaMutationTransportBinding({
	codec,
	metadata: { errors: {} },
	mutation,
})

describe('schema mutation transport binding capability', () => {
	it('keeps executable decoders private behind immutable nominal facts', () => {
		expect(codec).toStrictEqual({
			kind: 'schema-mutation-wire-codec',
			mutation,
			transport,
		})
		expect(binding).toStrictEqual({
			codec,
			kind: 'schema-mutation-transport-binding',
			metadata: { errors: {} },
			mutation,
			transport,
		})
		expect(Object.isFrozen(codec)).toBe(true)
		expect(Object.isFrozen(binding)).toBe(true)
		expect(JSON.stringify(codec)).not.toContain('decode')
	})

	it('derives the transport privilege from the native contribution', () => {
		expect(
			plugin({
				contributions: [
					contributeSchemaMutation({
						bindings: [binding],
						mutation,
						resolve: () => ({ data: {} }),
					}),
				],
				core: '^0.0.0',
				id: 'fixture.schema-mutation-transport-no-privilege',
				permissions: {
					'operation:declare': 'Declares archive.',
					'persistence:rewrite': 'Persists archive.',
				},
				version: '1.0.0',
			}).manifest.privileges.find(({ name }) => name === 'transport:expose'),
		).toStrictEqual({
			name: 'transport:expose',
			reason: 'Binds operations to transports.',
		})
	})
})
