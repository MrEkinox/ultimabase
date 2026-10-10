import { describe, expect, it } from 'vitest'

import { defineEnum, enumField } from '../../index.js'

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

	it('stores a shared enum as its values and its shared identity', () => {
		const Status = defineEnum('PostStatus', ['draft', 'published'])
		const field = enumField({ values: Status, default: 'published' })

		expect(field.options.values).toStrictEqual(['draft', 'published'])
		expect(Reflect.get(field.options, 'sharedEnum')).toBe(Status)
		expect(Status).toMatchObject({
			name: 'PostStatus',
			values: ['draft', 'published'],
		})
		expect(Object.isFrozen(Status)).toBe(true)
		expect(Object.isFrozen(Status.values)).toBe(true)
		expect(() => defineEnum('Post Status', ['draft'])).toThrow(
			new TypeError('defineEnum name must be an identifier: Post Status'),
		)
		expect(() => defineEnum('Empty', [] as never)).toThrow(
			new TypeError('defineEnum values must be a non-empty string array'),
		)
	})

	it('removes the mapping, native enum and typeName forms (ADR-0310)', () => {
		expect(() => {
			// @ts-expect-error -- Only arrays and shared enums name enum values.
			enumField({ values: { Draft: 'draft', Published: 'published' } })
		}).toThrow(
			new TypeError(
				'Enum values must be a non-empty string array or a shared enum from defineEnum',
			),
		)
		expect(() => {
			// @ts-expect-error -- TypeScript enum objects are mappings too.
			enumField({ values: NativeStatus })
		}).toThrow(TypeError)
		expect(() => {
			// @ts-expect-error -- A shared enum names the type, not an option.
			enumField({ typeName: 'PostStatus', values: ['draft', 'published'] })
		}).toThrow(TypeError)
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

	it('rejects an empty list', () => {
		expect(() => {
			// Runtime validation also protects dynamically produced JavaScript input.
			// @ts-expect-error -- Empty literal enum sources are rejected statically.
			enumField({ values: [] })
		}).toThrow(new TypeError('Enum values must be a non-empty string array'))
	})

	it('rejects duplicate values in a list', () => {
		expect(() => enumField({ values: ['draft', 'draft'] })).toThrow(
			new TypeError('Duplicate enum value: draft'),
		)
	})

	it('rejects numeric enums at the runtime boundary', () => {
		expect(() => {
			// @ts-expect-error -- Runtime coverage intentionally crosses the public type boundary.
			enumField({ values: NumericStatus })
		}).toThrow(
			new TypeError(
				'Enum values must be a non-empty string array or a shared enum from defineEnum',
			),
		)
	})

	it('rejects non-string values inside a list at runtime', () => {
		expect(() => {
			// @ts-expect-error -- Runtime coverage intentionally crosses the public type boundary.
			enumField({ values: ['draft', 1] })
		}).toThrow(new TypeError('Enum values must contain only strings'))
	})

	it('rejects values that are neither arrays nor shared enums', () => {
		const message =
			'Enum values must be a non-empty string array or a shared enum from defineEnum'
		expect(() => {
			// @ts-expect-error -- Runtime coverage intentionally crosses the public type boundary.
			enumField({ values: 'draft' })
		}).toThrow(new TypeError(message))

		expect(() => {
			// @ts-expect-error -- Collection instances are not enum values.
			enumField({ values: new Map([['Draft', 'draft']]) })
		}).toThrow(new TypeError(message))
		expect(() => {
			// @ts-expect-error -- A look-alike object is not a shared enum.
			enumField({ values: { name: 'Status', values: ['draft'] } })
		}).toThrow(new TypeError(message))
	})

	it('rejects defaults outside the persisted value domain', () => {
		expect(() => {
			// @ts-expect-error -- Runtime coverage intentionally crosses the inferred union.
			enumField({ values: ['draft', 'published'], default: 'archived' })
		}).toThrow(new TypeError('Invalid enum default: archived'))
	})
})
