import { expectTypeOf, test } from 'vitest'

import { defineCapability, optionalCapability } from './capabilities.js'
import type { PluginExports } from './definition.js'
import { plugin } from './plugin.js'
import {
	contributeApplication,
	contributeDeclarations,
} from './plugin-contributions.js'

const staticToken = defineCapability<Readonly<{ enabled: true }>>()({
	capabilityId: 'fixture.static-contract',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'declaration',
	compose: ([provider]) => provider,
})
const optionalStatic = optionalCapability(staticToken, '^1.0.0')

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
