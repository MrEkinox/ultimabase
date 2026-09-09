import { expectTypeOf, test } from 'vitest'

import {
	defineFieldBuilderMethod,
	stringField,
	type FieldBuilderMethodDefinition,
} from '../../index.js'

test('preserves exact method, kind, and factory identities', () => {
	const method = defineFieldBuilderMethod({
		name: 'text',
		contexts: {
			stored: {
				factory: stringField,
				fieldKind: 'fixture.text',
				typegen: {
					methodType: 'TextFieldBuilderMethod',
					module: '@fixture/text-plugin',
					valueType: 'TextValue',
				},
			},
		},
	})

	expectTypeOf(method.name).toEqualTypeOf<'text'>()
	expectTypeOf(method.contexts.stored.fieldKind).toEqualTypeOf<'fixture.text'>()
	expectTypeOf(method.contexts.stored.factory).toEqualTypeOf<
		typeof stringField
	>()
	expectTypeOf(method).toExtend<FieldBuilderMethodDefinition>()
})

test('rejects invalid plugin method contracts', () => {
	defineFieldBuilderMethod({
		name: 'text',
		contexts: {
			stored: {
				factory: stringField,
				fieldKind: 'fixture.text',
				typegen: {
					methodType: 'TextFieldBuilderMethod',
					module: '@fixture/text-plugin',
					valueType: 'TextValue',
				},
			},
		},
	})
	defineFieldBuilderMethod({
		name: 'reserved',
		contexts: {
			stored: {
				factory: stringField,
				// @ts-expect-error -- Plugin methods cannot claim a Core field kind.
				fieldKind: 'string',
				typegen: {
					methodType: 'TextFieldBuilderMethod',
					module: '@fixture/text-plugin',
					valueType: 'TextValue',
				},
			},
		},
	})
	defineFieldBuilderMethod({
		name: 'unnamespaced',
		contexts: {
			output: {
				factory: stringField,
				// @ts-expect-error -- Plugin field kinds must be namespaced.
				fieldKind: 'text',
				typegen: {
					methodType: 'TextFieldBuilderMethod',
					module: '@fixture/text-plugin',
					valueType: 'TextValue',
				},
			},
		},
	})
	defineFieldBuilderMethod({
		name: 'text',
		contexts: {
			stored: {
				// @ts-expect-error -- A method delegates to one callable factory.
				factory: true,
				fieldKind: 'fixture.text',
				typegen: {
					methodType: 'TextFieldBuilderMethod',
					module: '@fixture/text-plugin',
					valueType: 'TextValue',
				},
			},
		},
	})
})
