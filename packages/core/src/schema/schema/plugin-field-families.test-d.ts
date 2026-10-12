import { expectTypeOf, test } from 'vitest'

import {
	definePluginFieldFamily,
	stringField,
	type PluginFieldFamilyDefinition,
} from '../../index.js'

test('preserves exact family, builder, context, and factory identities', () => {
	const family = definePluginFieldFamily({
		fieldKind: 'fixture.text',
		builder: {
			name: 'text',
			contexts: {
				stored: {
					factory: stringField,
				},
			},
		},
	})

	expectTypeOf(family.fieldKind).toEqualTypeOf<'fixture.text'>()
	expectTypeOf(family.builder.name).toEqualTypeOf<'text'>()
	expectTypeOf(family.builder.contexts.stored.factory).toEqualTypeOf<
		typeof stringField
	>()
	expectTypeOf(family).toExtend<PluginFieldFamilyDefinition>()
})

test('rejects Core and unnamespaced field kinds', () => {
	definePluginFieldFamily({
		// @ts-expect-error -- Plugin field kinds remain namespaced.
		fieldKind: 'secret',
	})
	definePluginFieldFamily({
		// @ts-expect-error -- Core field kinds cannot be redefined by plugins.
		fieldKind: 'string',
	})
})
