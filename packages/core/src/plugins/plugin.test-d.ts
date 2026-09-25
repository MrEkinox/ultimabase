import { expectTypeOf, test } from 'vitest'

import { defineCapability, optionalCapability } from './capabilities.js'
import type { PluginExports } from './definition.js'
import { plugin } from './plugin.js'
import {
	contributeApplication,
	contributeDeclarations,
	type PluginApplicationContribution,
} from './plugin-contributions.js'

const staticToken = defineCapability<Readonly<{ enabled: true }>>()({
	capabilityId: 'fixture.static-contract',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'declaration',
	compose: ([provider]) => provider,
})
const optionalStatic = optionalCapability(staticToken, '^1.0.0')

test('normalizes an absent application export to void', () => {
	const definition = plugin({
		id: 'fixture.empty-application-exports',
		version: '1.0.0',
		core: '^0.0.0',
		contributions: [contributeApplication(() => ({}))],
	})

	expectTypeOf(definition).toBeObject()
	expectTypeOf<PluginExports<typeof definition>>().toEqualTypeOf<
		ReturnType<() => void>
	>()
})

test('unwraps asynchronous exports and preserves exact relationships', () => {
	const application = contributeApplication(() =>
		Promise.resolve({ exports: { ready: true } as const }),
	)
	expectTypeOf(application).toEqualTypeOf<
		PluginApplicationContribution<{ readonly ready: true }>
	>()
	const definition = plugin({
		id: 'fixture.async-plugin',
		version: '1.0.0',
		core: '^0.0.0',
		dependencies: [{ pluginId: 'fixture.base', version: '^0.0.0' }] as const,
		peers: [{ pluginId: 'fixture.protocol', version: '^1.0.0' }] as const,
		contributions: [application],
	})
	expectTypeOf<PluginExports<typeof definition>>().toEqualTypeOf<{
		readonly ready: true
	}>()
	expectTypeOf(definition.dependencies).toEqualTypeOf<
		| readonly [
				{ readonly pluginId: 'fixture.base'; readonly version: '^0.0.0' },
		  ]
		| undefined
	>()
	expectTypeOf(definition.peers).toEqualTypeOf<
		| readonly [
				{
					readonly pluginId: 'fixture.protocol'
					readonly version: '^1.0.0'
				},
		  ]
		| undefined
	>()
})

test('infers identity, exports, and exact static capability reads', () => {
	const definition = plugin({
		id: 'fixture.typed-plugin',
		instanceId: 'primary',
		version: '1.2.0',
		core: '^0.0.0',
		contributions: [
			contributeDeclarations({
				requires: [optionalStatic],
				schema: ({ capabilities, fields, schemas }) => {
					expectTypeOf(capabilities.get(optionalStatic)).toEqualTypeOf<
						Readonly<{ enabled: true }> | undefined
					>()
					void fields
					void schemas
					return undefined
				},
			}),
			contributeApplication(() => ({
				exports: { ready: true as const },
			})),
		],
		permissions: {
			'schema:declare': 'Declares fixture schema metadata.',
		},
	})

	expectTypeOf(
		definition.manifest.identity.pluginId,
	).toEqualTypeOf<'fixture.typed-plugin'>()
	expectTypeOf(definition.manifest.identity.instanceId).toEqualTypeOf<
		'primary' | undefined
	>()
	expectTypeOf<PluginExports<typeof definition>>().toEqualTypeOf<{
		readonly ready: true
	}>()
})
