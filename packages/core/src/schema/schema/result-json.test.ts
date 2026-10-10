import { describe, expect, expectTypeOf, it } from 'vitest'

import { UltimaBase } from '../../runtime/application/ultima-base.js'
import { toJSON, type BinaryJSON, type JsonOf } from './result-json.js'

const Author = UltimaBase.Schema.define({
	className: 'ResultJsonAuthor',
	fields: () => ({}),
})

// ADR-0310: `toJSON` serializes results exactly as REST responses do.
describe('toJSON', () => {
	it('encodes bigint, binary, pointers, dates and nested values', () => {
		const pointer = Author.pointer('0198f090-2a50-7000-8000-000000000001')
		const json = toJSON({
			attachment: Uint8Array.from([0, 127, 255]),
			author: pointer,
			count: 9_007_199_254_740_993n,
			instant: new Date('2026-08-01T10:15:30.123Z'),
			nested: [{ big: 1n, flag: true, empty: null }],
			title: 'Plain',
		})

		expect(json).toStrictEqual({
			attachment: { data: 'AH//', encoding: 'base64', type: 'binary' },
			author: {
				className: 'ResultJsonAuthor',
				id: '0198f090-2a50-7000-8000-000000000001',
				type: 'pointer',
			},
			count: '9007199254740993',
			instant: '2026-08-01T10:15:30.123Z',
			nested: [{ big: '1', empty: null, flag: true }],
			title: 'Plain',
		})
		expect(Object.isFrozen(json)).toBe(true)
		expect(JSON.parse(JSON.stringify(json))).toStrictEqual(json)
	})

	it('keeps every field name as an own key', () => {
		const record = toJSON(Object.fromEntries([['__proto__', 1n]]))
		expect(Object.hasOwn(record, '__proto__')).toBe(true)
		expect(Reflect.get(record, '__proto__')).toBe('1')
	})

	it('rejects values without a JSON representation', () => {
		expect(() => toJSON({ missing: undefined })).toThrow(
			new TypeError('toJSON received an unsupported undefined'),
		)
		expect(() => toJSON(Number.NaN)).toThrow(
			new TypeError('toJSON received a non-finite number'),
		)
		expect(() => toJSON(new Map())).toThrow(
			new TypeError('toJSON received an unsupported object'),
		)
		const cycle: Record<string, unknown> = {}
		cycle.self = cycle
		expect(() => toJSON(cycle)).toThrow(
			new TypeError('toJSON received a circular value'),
		)
	})

	it('maps each input type to its JSON shape', () => {
		type Row = Readonly<{
			attachment: Uint8Array
			count: bigint
			title: string
			tags: readonly bigint[]
		}>
		expectTypeOf<JsonOf<Row>>().toEqualTypeOf<{
			readonly attachment: BinaryJSON
			readonly count: string
			readonly title: string
			readonly tags: readonly string[]
		}>()
	})
})
