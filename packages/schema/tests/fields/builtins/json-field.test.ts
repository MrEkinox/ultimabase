import { describe, expect, it } from 'vitest'

import { jsonField } from '../../../src/index.js'

describe('jsonField', () => {
	it('creates frozen empty metadata', () => {
		const field = jsonField()

		expect(field).toStrictEqual({
			kind: 'json',
			options: {},
		})
		expect(Object.isFrozen(field)).toBe(true)
		expect(Object.isFrozen(field.options)).toBe(true)
	})

	it('copies and deeply freezes a portable JSON default', () => {
		const source = {
			enabled: true,
			profile: {
				tags: ['admin', 'author'],
				score: 10,
			},
		}
		const field = jsonField({
			default: source,
			validation: {
				required: true,
			},
		})

		source.profile.tags.push('changed')
		source.profile.score = 20

		// JSON normalization detaches all nested caller-owned values.
		expect(field.options.default).toStrictEqual({
			enabled: true,
			profile: {
				tags: ['admin', 'author'],
				score: 10,
			},
		})
		expect(Object.isFrozen(field.options.default)).toBe(true)
		expect(Object.isFrozen(field.options.default.profile)).toBe(true)
		expect(Object.isFrozen(field.options.default.profile.tags)).toBe(true)
	})

	it('allows repeated references when the value is not circular', () => {
		const shared = { value: 'same' }
		const field = jsonField({
			default: {
				first: shared,
				second: shared,
			},
		})

		// Repeated input references become independent portable JSON branches.
		expect(field.options.default).toStrictEqual({
			first: { value: 'same' },
			second: { value: 'same' },
		})
	})

	it.each([
		['undefined', { value: undefined }, 'default.value must be a JSON value'],
		[
			'NaN',
			{ value: Number.NaN },
			'default.value must contain only finite JSON numbers',
		],
		[
			'infinity',
			{ value: Number.POSITIVE_INFINITY },
			'default.value must contain only finite JSON numbers',
		],
		[
			'Date',
			{ value: new Date('2026-01-01T00:00:00.000Z') },
			'default.value must contain only plain JSON objects',
		],
	] as const)('rejects a non-portable %s default', (_name, value, message) => {
		expect(() => {
			// @ts-expect-error -- Runtime coverage intentionally crosses the JSON type boundary.
			jsonField({ default: value })
		}).toThrow(new TypeError(message))
	})

	it('rejects circular JSON defaults', () => {
		const circular: Record<string, unknown> = {}

		circular.self = circular

		expect(() => {
			// @ts-expect-error -- Circular unknown input cannot satisfy JsonValue statically.
			jsonField({ default: circular })
		}).toThrow(
			new TypeError('default.self must not contain circular references'),
		)
	})
})
