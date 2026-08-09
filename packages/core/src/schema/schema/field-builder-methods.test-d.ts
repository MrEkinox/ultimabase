import { expectTypeOf, test } from 'vitest'

import {
	defineFieldBuilderMethod,
	stringField,
	type FieldBuilderMethodDefinition,
} from '../../index.js'

test('preserves exact method, kind, and factory identities', () => {
	const method = defineFieldBuilderMethod({
		factory: stringField,
		fieldKind: 'fixture.text',
		name: 'text',
		typegen: {
			methodType: 'TextFieldBuilderMethod',
			module: '@fixture/text-plugin',
			valueType: 'TextValue',
		},
	})

	expectTypeOf(method.name).toEqualTypeOf<'text'>()
	expectTypeOf(method.fieldKind).toEqualTypeOf<'fixture.text'>()
	expectTypeOf(method.factory).toEqualTypeOf<typeof stringField>()
	expectTypeOf(method).toExtend<FieldBuilderMethodDefinition>()
})

test('rejects invalid plugin method contracts', () => {
	defineFieldBuilderMethod({
		factory: stringField,
		// @ts-expect-error -- Plugin field kinds remain namespaced.
		fieldKind: 'text',
		name: 'text',
		typegen: {
			methodType: 'TextFieldBuilderMethod',
			module: '@fixture/text-plugin',
			valueType: 'TextValue',
		},
	})
	defineFieldBuilderMethod({
		factory: stringField,
		// @ts-expect-error -- Core field kinds cannot become plugin method identities.
		fieldKind: 'string',
		name: 'text',
		typegen: {
			methodType: 'TextFieldBuilderMethod',
			module: '@fixture/text-plugin',
			valueType: 'TextValue',
		},
	})
	defineFieldBuilderMethod({
		// @ts-expect-error -- A method delegates to one callable field factory.
		factory: true,
		fieldKind: 'fixture.text',
		name: 'text',
		typegen: {
			methodType: 'TextFieldBuilderMethod',
			module: '@fixture/text-plugin',
			valueType: 'TextValue',
		},
	})
})
