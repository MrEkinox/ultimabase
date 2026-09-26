import { expectTypeOf, test } from 'vitest'

import {
	defineCapability,
	plugin as createPlugin,
	contributeDeclarations,
	optionalCapability,
	requireCapability,
	type PluginFieldFamilyRegistrar,
} from '../index.js'

const staticCapability = defineCapability<{ readonly label: 'static' }>()({
	capabilityId: 'fixture.typed-static',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'declaration',
	compose: ([provider]) => provider,
})
const applicationCapability = defineCapability<{ readonly label: 'live' }>()({
	capabilityId: 'fixture.typed-application',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([provider]) => provider,
})
const requiredStatic = requireCapability(staticCapability, '^1.0.0')
const optionalStatic = optionalCapability(staticCapability, '^1.0.0')
const optionalApplication = optionalCapability(applicationCapability, '^1.0.0')

test('selects exact declaration facades from privileges and requirements', () => {
	createPlugin({
		id: 'fixture.schema-authority',
		version: '1.0.0',
		core: '^0.0.0',
		permissions: { 'schema:declare': 'Protects the exact fields facade.' },
		contributions: [
			contributeDeclarations({
				requires: [requiredStatic, optionalStatic],
				schema: ({ capabilities, fields }) => {
					expectTypeOf(fields).toEqualTypeOf<PluginFieldFamilyRegistrar>()
					expectTypeOf(capabilities.get(requiredStatic)).toEqualTypeOf<{
						readonly label: 'static'
					}>()
					expectTypeOf(capabilities.get(optionalStatic)).toEqualTypeOf<
						{ readonly label: 'static' } | undefined
					>()
					// @ts-expect-error -- Application resources are unavailable during declaration.
					capabilities.get(optionalApplication)
				},
			}),
		],
	})

	createPlugin({
		id: 'fixture.conditional-schema-authority',
		version: '1.0.0',
		core: '^0.0.0',
		permissions: {
			'schema:declare': {
				reason: 'Declares fields only with the optional protocol.',
				when: optionalStatic,
			},
		},
		contributions: [
			optionalStatic,
			contributeDeclarations({
				schema: ({ fields }) => {
					expectTypeOf(fields).toEqualTypeOf<PluginFieldFamilyRegistrar>()

					return undefined
				},
			}),
		],
	})
})

test('removes the superseded declaration callback', () => {
	createPlugin({
		id: 'fixture.legacy-declaration',
		version: '1.0.0',
		core: '^0.0.0',
		// @ts-expect-error -- Phase-specific callbacks are no longer plugin options.
		declareFields: () => undefined,
		contributions: [],
	})
})
