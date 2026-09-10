import { describe, expect, it } from 'vitest'

import {
	FrameworkApplication,
	FrameworkError,
	defineOperationValue,
	definePlugin,
	defineSchemaMutation,
	provideCapability,
} from '../../foundation.js'
import {
	pluginSchemaMutationHandlerCapability,
	provideSchemaMutationHandler,
	schemaMutationHandler,
} from './capabilities.js'

const archive = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	input: defineOperationValue((value) => value),
	name: 'fixture.schema-mutation-capability.archive',
	returning: 'after',
	version: '1.0.0',
})
const handler = schemaMutationHandler({
	mutation: archive,
	resolve: () => ({ data: { state: 'archived' } }),
})

const captureFrameworkError = (run: () => unknown): unknown => {
	try {
		run()
	} catch (error: unknown) {
		if (error instanceof FrameworkError) return error
		throw error
	}
	throw new TypeError('Expected a FrameworkError')
}

describe('schema mutation handler capability', () => {
	it('keeps callbacks private behind an immutable nominal definition', () => {
		expect(handler).toStrictEqual({
			kind: 'plugin-schema-mutation-handler',
			mutation: archive,
		})
		expect(Object.isFrozen(handler)).toBe(true)
		expect(JSON.stringify(handler)).not.toContain('resolve')
		expect(() => schemaMutationHandler(null as never)).toThrow(
			'options must be a plain object',
		)
		expect(() =>
			schemaMutationHandler({ mutation: archive, resolve: true } as never),
		).toThrow('resolve must be a function')
	})

	it('requires the protected facade and persistence privilege', () => {
		const withoutPrivilege = definePlugin({
			capabilities: {
				provides: [
					provideSchemaMutationHandler({
						contributionId: 'archive',
						create: () => ({ value: handler }),
					}),
				],
			},
			core: '^0.0.0',
			pluginId: 'fixture.schema-mutation-no-privilege',
			version: '1.0.0',
		})
		const privilegeFailure = captureFrameworkError(
			() =>
				new FrameworkApplication({ plugins: [withoutPrivilege], schemas: [] }),
		)
		expect(privilegeFailure).toMatchObject({
			internalDetails: { privilege: 'persistence:rewrite' },
		})

		const generic = definePlugin({
			capabilities: {
				provides: [
					provideCapability(pluginSchemaMutationHandlerCapability, {
						contributionId: 'generic',
						create: () => ({ value: handler }),
					}),
				],
			},
			core: '^0.0.0',
			pluginId: 'fixture.schema-mutation-generic-provider',
			privileges: [
				{
					name: 'persistence:rewrite',
					reason: 'Exercises facade enforcement.',
				},
			],
			version: '1.0.0',
		})
		const facadeFailure = captureFrameworkError(
			() => new FrameworkApplication({ plugins: [generic], schemas: [] }),
		)
		expect(facadeFailure).toMatchObject({
			internalDetails: { kind: 'schema-mutation-provider-factory' },
		})
	})
})
