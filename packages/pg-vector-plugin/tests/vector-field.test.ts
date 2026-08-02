import { describe, expect, it } from 'vitest'
import { snapshotScalarFieldValue } from '@ultimabase/core'

import { vectorField, vectorFieldKind } from '../src/index.js'

describe('vectorField', () => {
	it('snapshots values through the public Schema field boundary', () => {
		const field = vectorField({ dimensions: 2 })
		const source = [1, 2]
		const snapshot = snapshotScalarFieldValue(field, source, 'embedding')

		source[0] = 9

		expect(snapshot).toStrictEqual([1, 2])
		expect(Object.isFrozen(snapshot)).toBe(true)
	})

	it('creates frozen vector metadata with a fixed dimension', () => {
		const source = [1, 2, 3]
		const field = vectorField({
			dimensions: 3,
			validation: { required: true },
			default: source,
			indexed: true,
		})

		source[0] = 9

		expect(field).toStrictEqual({
			kind: vectorFieldKind,
			options: {
				dimensions: 3,
				validation: { required: true },
				default: [1, 2, 3],
				indexed: true,
			},
		})
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
		expect(Object.isFrozen(field.options.default)).toBe(true)
	})

	it('supports homogeneous lists of vectors', () => {
		const first = [1, 2]
		const field = vectorField({
			dimensions: 2,
			list: true,
			default: [first, [3, 4]],
		})

		first[0] = 9

		expect(field.options.default).toStrictEqual([
			[1, 2],
			[3, 4],
		])
		expect(Object.isFrozen(field.options.default[0])).toBe(true)
	})

	it('keeps inline hooks out of public vector metadata', () => {
		const field = vectorField({
			dimensions: 2,
			hooks: { resolveInput: ({ value }) => value },
		})

		expect(field.options).toStrictEqual({ dimensions: 2 })
		expect(field.options).not.toHaveProperty('hooks')
	})

	it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1] as const)(
		'rejects the invalid dimension %s',
		(dimensions) => {
			expect(() => vectorField({ dimensions })).toThrow(
				new RangeError('dimensions must be a positive safe integer'),
			)
		},
	)

	it('rejects a non-numeric vector default', () => {
		expect(() => {
			// @ts-expect-error -- Runtime validation protects untyped callers.
			vectorField({ dimensions: 2, default: 'vector' })
		}).toThrow(new TypeError('default must be a vector of finite numbers'))
	})

	it('rejects a vector with the wrong dimension', () => {
		expect(() => vectorField({ dimensions: 3, default: [1, 2] })).toThrow(
			new RangeError('default must contain exactly 3 values'),
		)
	})

	it.each([Number.NaN, Number.POSITIVE_INFINITY, '2'] as const)(
		'rejects the invalid vector component %s',
		(value) => {
			expect(() => {
				// Reflection represents JavaScript callers that bypass TypeScript at the boundary.
				Reflect.apply(vectorField, undefined, [
					{ dimensions: 2, default: [1, value] },
				])
			}).toThrow(new TypeError('default[1] must be a finite number'))
		},
	)
})
