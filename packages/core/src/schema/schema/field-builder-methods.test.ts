import { describe, expect, it } from 'vitest'

import { defineFieldBuilderMethod, stringField } from '../../index.js'

const validDefinition = () => ({
	factory: stringField,
	fieldKind: 'fixture.text' as const,
	name: 'text' as const,
	typegen: {
		methodType: 'TextFieldBuilderMethod',
		module: '@fixture/text-plugin',
		valueType: 'TextValue',
	},
})

describe('defineFieldBuilderMethod', () => {
	it('snapshots stable generation metadata without wrapping its factory', () => {
		const input = validDefinition()
		const method = defineFieldBuilderMethod(input)

		input.typegen.methodType = 'MutatedMethod'

		expect(method).toStrictEqual({
			factory: stringField,
			fieldKind: 'fixture.text',
			name: 'text',
			typegen: {
				methodType: 'TextFieldBuilderMethod',
				module: '@fixture/text-plugin',
				valueType: 'TextValue',
			},
		})
		expect(method.factory).toBe(stringField)
		expect(Object.isFrozen(method)).toBe(true)
		expect(Object.isFrozen(method.typegen)).toBe(true)
	})

	it('rejects unstable names, kinds, factories, and type references', () => {
		expect(() =>
			defineFieldBuilderMethod({ ...validDefinition(), name: 'with-dash' }),
		).toThrow(
			new TypeError(
				'FieldBuilder method name must be a TypeScript property identifier',
			),
		)
		expect(() =>
			defineFieldBuilderMethod({
				...validDefinition(),
				// @ts-expect-error -- Runtime validation protects JavaScript callers.
				fieldKind: 'text',
			}),
		).toThrow(
			new TypeError(
				'FieldBuilder method fieldKind must use a namespaced identifier',
			),
		)
		expect(() =>
			defineFieldBuilderMethod({
				...validDefinition(),
				// @ts-expect-error -- Runtime validation protects JavaScript callers.
				factory: true,
			}),
		).toThrow(new TypeError('FieldBuilder method factory must be a function'))
		expect(() =>
			defineFieldBuilderMethod({
				...validDefinition(),
				typegen: {
					...validDefinition().typegen,
					module: ' @fixture/text-plugin',
				},
			}),
		).toThrow(
			new TypeError(
				'FieldBuilder method typegen.module must be a stable module specifier',
			),
		)
		expect(() =>
			defineFieldBuilderMethod({
				...validDefinition(),
				typegen: {
					...validDefinition().typegen,
					valueType: 'readonly number[]',
				},
			}),
		).toThrow(
			new TypeError(
				'FieldBuilder method typegen.valueType must be a TypeScript export identifier',
			),
		)
	})
})
