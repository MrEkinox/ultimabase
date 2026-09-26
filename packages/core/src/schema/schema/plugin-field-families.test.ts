import { describe, expect, it } from 'vitest'

import { definePluginFieldFamily, stringField } from '../../index.js'

const validDefinition = () => ({
	fieldKind: 'fixture.text' as const,
	typegen: {
		module: '@fixture/text-plugin',
		valueType: 'TextValue',
	},
	builder: {
		name: 'text' as const,
		contexts: {
			stored: {
				factory: stringField,
				methodType: 'TextFieldBuilderMethod',
			},
		},
	},
})

describe('definePluginFieldFamily', () => {
	it('snapshots shared metadata without wrapping its factory', () => {
		const input = validDefinition()
		const family = definePluginFieldFamily(input)
		input.typegen.valueType = 'MutatedValue'
		input.builder.contexts.stored.methodType = 'MutatedMethod'

		expect(family).toStrictEqual({
			fieldKind: 'fixture.text',
			typegen: {
				module: '@fixture/text-plugin',
				valueType: 'TextValue',
			},
			builder: {
				name: 'text',
				contexts: {
					stored: {
						factory: stringField,
						methodType: 'TextFieldBuilderMethod',
					},
				},
			},
		})
		expect(family.builder.contexts.stored.factory).toBe(stringField)
		expect(Object.isFrozen(family.builder.contexts.stored)).toBe(true)
	})

	it('retains exact per-context kind and Typegen overrides', () => {
		const family = definePluginFieldFamily({
			...validDefinition(),
			builder: {
				...validDefinition().builder,
				contexts: {
					output: {
						factory: stringField,
						fieldKind: 'fixture.output-text',
						methodType: 'TextOutputBuilderMethod',
						typegen: {
							module: '@fixture/output-text-plugin',
							valueType: 'TextOutputValue',
						},
					},
				},
			},
		})

		expect(family.builder.contexts.output).toMatchObject({
			fieldKind: 'fixture.output-text',
			methodType: 'TextOutputBuilderMethod',
		})
	})

	it('rejects unstable families, builders, and type references', () => {
		const defineUntyped = definePluginFieldFamily as (
			definition: unknown,
		) => unknown
		expect(() =>
			definePluginFieldFamily({
				...validDefinition(),
				builder: { name: 'empty', contexts: {} },
			}),
		).toThrow(
			'Plugin field family builder contexts must declare at least one context',
		)
		expect(() =>
			definePluginFieldFamily({
				...validDefinition(),
				builder: { ...validDefinition().builder, name: 'with-dash' },
			}),
		).toThrow(
			'Plugin field family builder name must be a TypeScript property identifier',
		)
		expect(() =>
			defineUntyped({
				...validDefinition(),
				builder: {
					name: 'unknown',
					contexts: {
						other: validDefinition().builder.contexts.stored,
					},
				},
			}),
		).toThrow(
			'Plugin field family builder context must be stored, embedded, virtual, or output',
		)
		expect(() =>
			defineUntyped({
				...validDefinition(),
				builder: {
					...validDefinition().builder,
					contexts: {
						stored: {
							...validDefinition().builder.contexts.stored,
							factory: true,
						},
					},
				},
			}),
		).toThrow(
			'Plugin field family builder contexts.stored.factory must be a function',
		)
		expect(() =>
			definePluginFieldFamily({
				...validDefinition(),
				typegen: {
					...validDefinition().typegen,
					module: ' @fixture/text-plugin',
				},
			}),
		).toThrow(
			'Plugin field family typegen.module must be a stable module specifier',
		)
		expect(() =>
			definePluginFieldFamily({
				...validDefinition(),
				// @ts-expect-error -- Runtime protects JavaScript callers too.
				fieldKind: 'text',
			}),
		).toThrow('Plugin field family fieldKind must use a namespaced identifier')
		expect(() =>
			definePluginFieldFamily({
				...validDefinition(),
				typegen: { ...validDefinition().typegen, valueType: 'Text<Value>' },
			}),
		).toThrow(
			'Plugin field family typegen.valueType must be a TypeScript export identifier',
		)
	})
})
