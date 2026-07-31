import { Buffer } from 'node:buffer'

import { describe, expect, it, vi } from 'vitest'

import { binaryField } from '../src/index.js'

describe('binaryField', () => {
	it('creates frozen default metadata', () => {
		const field = binaryField()

		expect(field).toStrictEqual({
			kind: 'binary',
			options: {},
		})
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
	})

	it('preserves byte-length validation and common metadata', () => {
		const field = binaryField({
			validation: {
				required: true,
				length: {
					min: 1,
					max: 1024,
				},
			},
			immutable: true,
			indexed: false,
		})

		expect(field.options).toStrictEqual({
			validation: {
				required: true,
				length: {
					min: 1,
					max: 1024,
				},
			},
			immutable: true,
			indexed: false,
		})
		expect(Object.isFrozen(field.options.validation)).toBe(true)
		expect(Object.isFrozen(field.options.validation.length)).toBe(true)
	})

	it('copies Uint8Array defaults', () => {
		const source = new Uint8Array([1, 2, 3])
		const field = binaryField({ default: source })

		source[0] = 9

		expect(field.options.default).toStrictEqual(new Uint8Array([1, 2, 3]))
		expect(field.options.default).not.toBe(source)
	})

	it('copies Buffer defaults without losing their runtime type', () => {
		const source = Buffer.from([1, 2, 3])
		const field = binaryField({ default: source })

		source[0] = 9

		expect(Buffer.isBuffer(field.options.default)).toBe(true)
		expect(field.options.default).toStrictEqual(Buffer.from([1, 2, 3]))
		expect(field.options.default).not.toBe(source)
	})

	it('copies every binary value inside list defaults', () => {
		const first = new Uint8Array([1])
		const second = Buffer.from([2])
		const field = binaryField({
			list: true,
			default: [first, second],
		})

		first[0] = 9
		second[0] = 9

		expect(field.options.default).toStrictEqual([
			new Uint8Array([1]),
			Buffer.from([2]),
		])
		expect(Object.isFrozen(field.options.default)).toBe(true)
	})

	it('copies caller-owned length metadata', () => {
		const length: { min?: number; max?: number } = { min: 1 }
		const field = binaryField({ validation: { length } })

		length.min = 4
		length.max = 8

		expect(field.options.validation.length).toStrictEqual({ min: 1 })
	})

	it('preserves runtime factories without executing them', () => {
		const factory = vi.fn(() => new Uint8Array([1]))
		const field = binaryField({ default: factory })

		expect(field.options.default).toBe(factory)
		expect(factory).not.toHaveBeenCalled()
	})

	it.each([
		['maximum', { max: 1024 }],
		['minimum', { min: 1 }],
	] as const)(
		'supports a one-sided %s byte-length constraint',
		(_name, length) => {
			const field = binaryField({ validation: { length } })

			expect(field.options.validation.length).toStrictEqual(length)
		},
	)

	it('freezes presence validation without a length constraint', () => {
		const field = binaryField({ validation: { nullable: true } })

		expect(field.options.validation).toStrictEqual({ nullable: true })
		expect(Object.isFrozen(field.options.validation)).toBe(true)
	})

	it.each([
		['string', 'bytes'],
		['ArrayBuffer', new ArrayBuffer(4)],
		['DataView', new DataView(new ArrayBuffer(4))],
	] as const)('rejects a %s default', (_name, value) => {
		expect(() => {
			// @ts-expect-error -- Runtime validation protects untyped callers.
			binaryField({ default: value })
		}).toThrow(new TypeError('default must be a Uint8Array'))
	})

	it.each([
		['negative', { min: -1 }],
		['fractional', { max: 1.5 }],
		['unsafe', { max: Number.MAX_SAFE_INTEGER + 1 }],
	] as const)('rejects a %s byte-length boundary', (_name, length) => {
		expect(() => binaryField({ validation: { length } })).toThrow(
			new RangeError(
				`validation.length.${'min' in length ? 'min' : 'max'} must be a non-negative safe integer`,
			),
		)
	})

	it('rejects an inverted byte-length range', () => {
		expect(() =>
			binaryField({
				validation: {
					length: {
						min: 8,
						max: 4,
					},
				},
			}),
		).toThrow(
			new RangeError(
				'validation.length.min cannot be greater than validation.length.max',
			),
		)
	})
})
