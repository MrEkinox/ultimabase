import { immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import {
	FrameworkApplication,
	FrameworkError,
	defineOperationValue,
	definePlugin,
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
		const withoutPrivilege = definePlugin({
			capabilities: [
				provideSchemaMutationTransportBinding({
					contributionId: 'binding',
					create: () => ({ value: binding }),
				}),
			],
			core: '^0.0.0',
			pluginId: 'fixture.schema-mutation-transport-no-privilege',
			version: '1.0.0',
		})
		expect(
			captureFrameworkError(
				() =>
					new FrameworkApplication({
						plugins: [withoutPrivilege],
						schemas: [],
					}),
			).internalDetails,
		).toMatchObject({ privilege: 'transport:expose' })

		const generic = definePlugin({
			capabilities: [
				provideCapability(schemaMutationTransportBindingCapability, {
					contributionId: 'generic',
					create: () => ({ value: binding }),
				}),
			],
			core: '^0.0.0',
			pluginId: 'fixture.schema-mutation-transport-generic',
			privileges: [
				{ name: 'transport:expose', reason: 'Exercises facade enforcement.' },
			],
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
