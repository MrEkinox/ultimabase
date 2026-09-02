import { describe, expect, it } from 'vitest'

import { enumField } from '../../index.js'

enum NativeStatus {
	Draft = 'draft',
	Published = 'published',
}

enum NumericStatus {
	Draft,
	Published,
}

describe('enumField', () => {
	it('copies and freezes a string value list', () => {
		const source = ['draft', 'published']
		const field = enumField({
			values: source,
			required: true,
			default: 'draft',
			indexed: true,
		})

		source.push('archived')

		expect(field).toStrictEqual({
			kind: 'enum',
			options: {
				values: ['draft', 'published'],
				required: true,
				default: 'draft',
				indexed: true,
			},
		})
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
		expect(Object.isFrozen(field.options.values)).toBe(true)
	})

	it('preserves symbolic keys from a mapping', () => {
		const source = {
			Draft: 'draft',
			Published: 'published',
		}
		const field = enumField({
			values: source,
			default: 'published',
		})

		source.Draft = 'changed'

		// Symbolic names survive normalization while persisted values are copied.
		expect(field.options.values).toStrictEqual({
			Draft: 'draft',
			Published: 'published',
		})
		expect(Object.isFrozen(field.options.values)).toBe(true)
	})

	it('preserves an explicit neutral type name', () => {
		const field = enumField({
			typeName: 'PostStatus',
			values: ['draft', 'published'],
		})

		expect(field.options.typeName).toBe('PostStatus')
		expect(() => enumField({ typeName: '', values: ['draft'] })).toThrow(
			new TypeError('typeName must be a non-empty string'),
		)
		expect(() => {
			// @ts-expect-error -- Runtime coverage crosses the type-name boundary.
			enumField({ typeName: 42, values: ['draft'] })
		}).toThrow(new TypeError('typeName must be a non-empty string'))
	})

	it('accepts a native string enum as a mapping', () => {
		const field = enumField({
			values: NativeStatus,
			default: NativeStatus.Draft,
		})

		expect(field.options.values).toStrictEqual({
			Draft: 'draft',
			Published: 'published',
		})
	})

	it('validates and freezes every persisted value in a list default', () => {
		const source: ('draft' | 'published')[] = ['draft']
		const field = enumField({
			values: ['draft', 'published'],
			list: true,
			default: source,
		})

		source.push('published')

		expect(field.options.default).toStrictEqual(['draft'])
		expect(Object.isFrozen(field.options.default)).toBe(true)
		expect(() => {
			// @ts-expect-error -- Runtime coverage crosses the inferred enum domain.
			enumField({
				values: ['draft', 'published'],
				list: true,
				default: ['archived'],
			})
		}).toThrow(new TypeError('Invalid enum default at default[0]: archived'))
	})

	it.each([
		['list', []],
		['mapping', {}],
	] as const)('rejects an empty %s', (_name, values) => {
		expect(() => {
			// Runtime validation also protects dynamically produced JavaScript input.
			// @ts-expect-error -- Empty literal enum sources are rejected statically.
			enumField({ values })
		}).toThrow(new TypeError('Enum values cannot be empty'))
	})

	it.each([
		['list', ['draft', 'draft']],
		[
			'mapping',
			{
				Primary: 'draft',
				Alias: 'draft',
			},
		],
	] as const)('rejects duplicate values in a %s', (_name, values) => {
		expect(() => enumField({ values })).toThrow(
			new TypeError('Duplicate enum value: draft'),
		)
	})

	it('rejects numeric enums at the runtime boundary', () => {
		expect(() => {
			// Native numeric enums contain reverse mappings and cannot be string domains.
			// @ts-expect-error -- Runtime coverage intentionally crosses the public type boundary.
			enumField({ values: NumericStatus })
		}).toThrow(new TypeError('Enum values must contain only strings'))
	})

	it('rejects non-string values inside a list at runtime', () => {
		expect(() => {
			// @ts-expect-error -- Runtime coverage intentionally crosses the public type boundary.
			enumField({ values: ['draft', 1] })
		}).toThrow(new TypeError('Enum values must contain only strings'))
	})

	it('rejects values that are neither lists nor mappings', () => {
		expect(() => {
			// @ts-expect-error -- Runtime coverage intentionally crosses the public type boundary.
			enumField({ values: 'draft' })
		}).toThrow(new TypeError('Enum values must be a string list or mapping'))

		expect(() => {
			// @ts-expect-error -- Collection instances are not symbolic mappings.
			enumField({ values: new Map([['Draft', 'draft']]) })
		}).toThrow(new TypeError('Enum values must be a string list or mapping'))
	})

	it('rejects defaults outside the persisted value domain', () => {
		expect(() => {
			// @ts-expect-error -- Runtime coverage intentionally crosses the inferred union.
			enumField({ values: ['draft', 'published'], default: 'archived' })
		}).toThrow(new TypeError('Invalid enum default: archived'))
	})
})
