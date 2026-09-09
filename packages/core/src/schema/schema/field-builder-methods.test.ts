import { describe, expect, it } from 'vitest'

import { defineFieldBuilderMethod, stringField } from '../../index.js'

const validDefinition = () => ({
	name: 'text' as const,
	contexts: {
		stored: {
			factory: stringField,
			fieldKind: 'fixture.text' as const,
			typegen: {
				methodType: 'TextFieldBuilderMethod',
				module: '@fixture/text-plugin',
				valueType: 'TextValue',
			},
		},
	},
})

describe('defineFieldBuilderMethod', () => {
	it('snapshots stable generation metadata without wrapping its factory', () => {
		const input = validDefinition()
		const method = defineFieldBuilderMethod(input)

		input.contexts.stored.typegen.methodType = 'MutatedMethod'

		expect(method).toStrictEqual({
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
			name: 'text',
		})
		expect(method.contexts.stored.factory).toBe(stringField)
		expect(Object.isFrozen(method)).toBe(true)
		expect(Object.isFrozen(method.contexts.stored.typegen)).toBe(true)
	})

	it('rejects unstable names, kinds, factories, and type references', () => {
		expect(() =>
			defineFieldBuilderMethod({ name: 'empty', contexts: {} }),
		).toThrow('FieldBuilder method contexts must declare at least one context')
		expect(() =>
			defineFieldBuilderMethod({
				name: 'unknown',
				contexts: {
					// @ts-expect-error -- Runtime protects declarations loaded from JavaScript.
					other: validDefinition().contexts.stored,
				},
			}),
		).toThrow(
			'FieldBuilder method context must be stored, embedded, virtual, or output',
		)
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
				contexts: {
					stored: {
						...validDefinition().contexts.stored,
						// @ts-expect-error -- Runtime protects declarations loaded from JavaScript.
						fieldKind: 'text',
					},
				},
			}),
		).toThrow(
			new TypeError(
				'FieldBuilder method contexts.stored.fieldKind must use a namespaced identifier',
			),
		)
		expect(() =>
			defineFieldBuilderMethod({
				...validDefinition(),
				contexts: {
					stored: {
						...validDefinition().contexts.stored,
						// @ts-expect-error -- Runtime validation protects JavaScript callers.
						factory: true,
					},
				},
			}),
		).toThrow(
			new TypeError(
				'FieldBuilder method contexts.stored.factory must be a function',
			),
		)
		expect(() =>
			defineFieldBuilderMethod({
				...validDefinition(),
				contexts: {
					stored: {
						...validDefinition().contexts.stored,
						typegen: {
							...validDefinition().contexts.stored.typegen,
							module: ' @fixture/text-plugin',
						},
					},
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
				contexts: {
					stored: {
						...validDefinition().contexts.stored,
						typegen: {
							...validDefinition().contexts.stored.typegen,
							valueType: 'readonly number[]',
						},
					},
				},
			}),
		).toThrow(
			new TypeError(
				'FieldBuilder method typegen.valueType must be a TypeScript export identifier',
			),
		)
	})
})
