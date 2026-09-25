import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import {
	FrameworkApplication,
	FrameworkError,
	defineOperationValue,
	plugin,
	defineSchemaMutation,
	provideCapability,
} from '../../foundation.js'
import { defineOperationTransport } from '../plugin-operations/capabilities.js'
import {
	provideSchemaMutationTransportBinding,
	schemaMutationTransportBinding,
	schemaMutationTransportBindingCapability,
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

interface CapturedFrameworkError {
	readonly internalDetails: unknown
}

const captureFrameworkError = (run: () => unknown): CapturedFrameworkError => {
	try {
		run()
	} catch (error: unknown) {
		if (error instanceof FrameworkError) {
			return { internalDetails: error.internalDetails }
		}
		throw error
	}
	throw new TypeError('Expected a FrameworkError')
}

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

	it('requires the protected provider facade and transport privilege', () => {
		expect(() =>
			plugin({
				contributions: [
					provideSchemaMutationTransportBinding({
						contributionId: 'binding',
						create: () => ({ value: binding }),
					}),
				],
				core: '^0.0.0',
				id: 'fixture.schema-mutation-transport-no-privilege',
				version: '1.0.0',
			}),
		).toThrow('Missing plugin permission reason: transport:expose')

		const generic = plugin({
			contributions: [
				provideCapability(schemaMutationTransportBindingCapability, {
					contributionId: 'generic',
					create: () => ({ value: binding }),
				}),
			],
			core: '^0.0.0',
			id: 'fixture.schema-mutation-transport-generic',
			permissions: { 'transport:expose': 'Exercises facade enforcement.' },
			version: '1.0.0',
		})
		expect(
			captureFrameworkError(
				() => new FrameworkApplication({ plugins: [generic], schemas: [] }),
			).internalDetails,
		).toMatchObject({
			kind: 'schema-mutation-transport-provider-factory',
		})
	})
})
