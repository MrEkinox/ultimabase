import { describe, expect, it } from 'vitest'

import {
	defineOperationTransport,
	operationTransportBinding,
	operationWireCodec,
} from '../runtime/plugin-operations/capabilities.js'
import {
	schemaMutationTransportBinding,
	schemaMutationWireCodec,
} from '../runtime/schema-mutations/transport-capabilities.js'
import { plugin as createPlugin } from './plugin.js'
import { defineOperation, defineOperationValue } from './plugin-operations.js'
import {
	contributeSchemaMutation,
	contributeSchemaMutationBinding,
} from './plugin-schema-mutation-contributions.js'
import { defineSchemaMutation } from './plugin-schema-mutations.js'

const input = defineOperationValue((value) => String(value))
const archive = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	input,
	name: 'fixture.contribution.archive',
	returning: 'after',
	version: '1.0.0',
})
const transport = defineOperationTransport({
	name: 'fixture.contribution.transport',
	version: '1.0.0',
})
const codec = schemaMutationWireCodec({
	decode: (value: { readonly text: string }) => value.text,
	mutation: archive,
	transport,
})
const binding = schemaMutationTransportBinding({
	codec,
	mutation: archive,
})

describe('plugin schema-mutation contributions', () => {
	it('derives the logical declaration, handler, and transport provider', () => {
		const contribution = contributeSchemaMutation({
			bindings: [binding],
			mutation: archive,
			resolve: () => ({ data: { workflowState: 'archived' } }),
		})
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.schema-mutation-contribution',
			permissions: {
				'operation:declare': 'Declares archive.',
				'persistence:rewrite': 'Persists archive.',
				'transport:expose': 'Exposes archive.',
			},
			version: '1.0.0',
			contributions: [contribution],
		})

		expect(contribution).toStrictEqual({
			bindings: [binding],
			kind: 'plugin-schema-mutation-contribution',
			mutation: archive,
		})
		expect(plugin.manifest.capabilities.provides).toStrictEqual([])
	})

	it('supports resource-backed resolvers and separately owned bindings', () => {
		const resource = contributeSchemaMutation({
			create: () => ({
				dispose: () => undefined,
				resolve: () => ({ data: { workflowState: 'archived' } }),
			}),
			mutation: archive,
		})
		const externalBinding = contributeSchemaMutationBinding(binding)
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.schema-mutation-resource',
			permissions: {
				'operation:declare': 'Declares archive.',
				'persistence:rewrite': 'Persists archive.',
				'transport:expose': 'Exposes archive.',
			},
			version: '1.0.0',
			contributions: [resource, externalBinding],
		})

		expect(plugin.manifest.capabilities.provides).toHaveLength(0)
		expect(externalBinding).toStrictEqual({
			binding,
			kind: 'plugin-schema-mutation-binding-contribution',
		})
	})

	it('rejects forged options and bindings for another mutation family', () => {
		const inspect = defineOperation({
			input,
			name: 'fixture.contribution.inspect',
			result: input,
			target: 'application',
			transaction: 'forbidden',
			version: '1.0.0',
		})
		const operationCodec = operationWireCodec({
			decode: (value: unknown) => String(value),
			encode: (value: string) => value,
			operation: inspect,
			transport,
		})

		expect(() =>
			contributeSchemaMutation({
				mutation: archive,
				resolve: () => ({ data: {} }),
				unknown: true,
			} as never),
		).toThrow('Unknown plugin schema mutation contribution option: unknown')
		expect(() =>
			contributeSchemaMutation({
				bindings: [
					operationTransportBinding({
						codec: operationCodec,
						operation: inspect,
					}),
				] as never,
				mutation: archive,
				resolve: () => ({ data: {} }),
			}),
		).toThrow('must be created by schemaMutationTransportBinding')
		expect(() =>
			contributeSchemaMutation({
				create: () => ({ resolve: () => ({ data: {} }) }),
				mutation: archive,
				resolve: () => ({ data: {} }),
			} as never),
		).toThrow('requires exactly one of create or resolve')
	})
})
