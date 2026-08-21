import { expectTypeOf, test } from 'vitest'

import {
	definePluginFieldType,
	type PluginFieldTypeDefinition,
} from '../../index.js'

test('preserves an exact namespaced plugin field kind', () => {
	const fieldType = definePluginFieldType({
		fieldKind: 'fixture.secret',
		typegen: {
			module: '@fixture/secret-plugin',
			structuralContainsType: 'SecretContainsOperand',
			valueType: 'SecretValue',
		},
	})

	expectTypeOf(fieldType.fieldKind).toEqualTypeOf<'fixture.secret'>()
	expectTypeOf(fieldType).toExtend<PluginFieldTypeDefinition>()
})

test('rejects Core and unnamespaced field kinds', () => {
	definePluginFieldType({
		// @ts-expect-error -- Plugin field kinds remain namespaced.
		fieldKind: 'secret',
		typegen: {
			module: '@fixture/secret-plugin',
			valueType: 'SecretValue',
		},
	})
	definePluginFieldType({
		// @ts-expect-error -- Core field kinds cannot be redefined by plugins.
		fieldKind: 'string',
		typegen: {
			module: '@fixture/secret-plugin',
			valueType: 'SecretValue',
		},
	})
})
