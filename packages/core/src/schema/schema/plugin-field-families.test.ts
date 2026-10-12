import { describe, expect, it } from 'vitest'

import { definePluginFieldFamily, stringField } from '../../index.js'

const validDefinition = () => ({
	fieldKind: 'fixture.text' as const,
	builder: {
		name: 'text' as const,
		contexts: {
			stored: {
				factory: stringField,
			},
		},
	},
})

describe('definePluginFieldFamily', () => {
	it('snapshots shared metadata without wrapping its factory', () => {
		const input = validDefinition()
		const family = definePluginFieldFamily(input)
		Reflect.set(input.builder, 'name', 'mutated')
		Reflect.set(input.builder.contexts.stored, 'fieldKind', 'fixture.mutated')

		expect(family).toStrictEqual({
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
		expect(family.builder.contexts.stored.factory).toBe(stringField)
		expect(Object.isFrozen(family.builder.contexts.stored)).toBe(true)
	})

	it('retains exact per-context kind overrides', () => {
		const family = definePluginFieldFamily({
			...validDefinition(),
			builder: {
				...validDefinition().builder,
				contexts: {
					output: {
						factory: stringField,
						fieldKind: 'fixture.output-text',
					},
				},
			},
		})

		expect(family.builder.contexts.output).toMatchObject({
			fieldKind: 'fixture.output-text',
		})
	})

	it('rejects unstable families and builders', () => {
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
		// Typegen metadata left with Typegen (ADR-0297).
		expect(() =>
			defineUntyped({
				...validDefinition(),
				typegen: { module: '@fixture/text', valueType: 'TextValue' },
			}),
		).toThrow('Unknown Plugin field family definition key: typegen')
		expect(() =>
			defineUntyped({
				...validDefinition(),
				builder: {
					...validDefinition().builder,
					contexts: {
						stored: { factory: stringField, methodType: 'TextMethod' },
					},
				},
			}),
		).toThrow(
			'Unknown Plugin field family builder contexts.stored key: methodType',
		)
		expect(() =>
			definePluginFieldFamily({
				...validDefinition(),
				// @ts-expect-error -- Runtime protects JavaScript callers too.
				fieldKind: 'text',
			}),
		).toThrow('Plugin field family fieldKind must use a namespaced identifier')
	})
})
