import { expectTypeOf, test } from 'vitest'

import {
	defineCapability,
	definePlugin,
	optionalCapability,
	requireCapability,
	type FieldBuilderMethodRegistrar,
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
	definePlugin({
		pluginId: 'fixture.no-schema-authority',
		version: '1.0.0',
		core: '^0.0.0',
		declare: (context) => {
			expectTypeOf(context).not.toHaveProperty('fields')
			expectTypeOf(context).not.toHaveProperty('schemas')
			expectTypeOf(context).not.toHaveProperty('services')
			expectTypeOf(context).not.toHaveProperty('adapters')
			expectTypeOf(context).not.toHaveProperty('request')
		},
	})

	definePlugin({
		pluginId: 'fixture.schema-authority',
		version: '1.0.0',
		core: '^0.0.0',
		privileges: [
			{
				name: 'schema:declare',
				reason: 'Protects the exact fields facade.',
			},
		] as const,
		capabilities: [requiredStatic, optionalStatic, optionalApplication],
		declare: ({ capabilities, fields }) => {
			expectTypeOf(fields).toEqualTypeOf<FieldBuilderMethodRegistrar>()
			expectTypeOf(capabilities.get(requiredStatic)).toEqualTypeOf<{
				readonly label: 'static'
			}>()
			expectTypeOf(capabilities.get(optionalStatic)).toEqualTypeOf<
				{ readonly label: 'static' } | undefined
			>()
			// @ts-expect-error -- Application resources are unavailable during declaration.
			capabilities.get(optionalApplication)
		},
	})

	definePlugin({
		pluginId: 'fixture.conditional-schema-authority',
		version: '1.0.0',
		core: '^0.0.0',
		capabilities: [optionalStatic],
		privileges: [
			{
				name: 'schema:declare',
				reason: 'Declares fields only with the optional protocol.',
				when: optionalStatic,
			},
		] as const,
		declare: ({ fields }) => {
			expectTypeOf(fields).toEqualTypeOf<
				FieldBuilderMethodRegistrar | undefined
			>()
		},
	})
})

test('removes the superseded declaration callback', () => {
	definePlugin({
		pluginId: 'fixture.legacy-declaration',
		version: '1.0.0',
		core: '^0.0.0',
		// @ts-expect-error -- Static declarations use the canonical declare callback.
		declareFields: () => undefined,
	})
})
