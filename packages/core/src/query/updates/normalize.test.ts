import { describe, expect, it } from 'vitest'

import { normalizeUpdateExpression } from './normalize.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const accountSchema = UltimaBase.Schema.define({
	className: 'Account',
	fields: (field) => ({
		name: field.string({ required: true }),
		nickname: field.string(),
		visits: field.int(),
		rating: field.float(),
		balance: field.decimal(),
		sequence: field.bigint(),
		serial: field.int({ autoIncrement: true }),
		refreshedAt: field.dateTime({ autoNow: true }),
		scores: field.int({ list: true }),
		operationLike: field.object({
			fields: (field) => ({
				kind: field.string({ required: true }),
				value: field.int({ required: true }),
			}),
		}),
		lockedCounter: field.int({ immutable: true }),
	}),
})

describe('normalizeUpdateExpression', () => {
	it('normalizes field values in deterministic declaration order', () => {
		const expression = normalizeUpdateExpression(accountSchema, {
			rating: { decrement: 0.5 },
			visits: { increment: 2 },
			balance: { increment: '1.25' },
			name: 'Updated account',
			nickname: null,
			sequence: { decrement: 1n },
		})

		expect(expression).toStrictEqual({
			kind: 'update-expression',
			operations: [
				{ kind: 'decrement', field: 'rating', value: 0.5 },
				{ kind: 'increment', field: 'visits', value: 2 },
				{ kind: 'increment', field: 'balance', value: '1.25' },
				{ kind: 'set', field: 'name', value: 'Updated account' },
				{ kind: 'set', field: 'nickname', value: null },
				{ kind: 'decrement', field: 'sequence', value: 1n },
			],
		})
		expect(Object.isFrozen(expression)).toBe(true)
		expect(Object.isFrozen(expression.operations)).toBe(true)
		expect(
			expression.operations.every((operation) => Object.isFrozen(operation)),
		).toBe(true)
		// `null` is the canonical replacement that clears an optional field.
		expect(
			normalizeUpdateExpression(accountSchema, { rating: null }).operations,
		).toStrictEqual([{ kind: 'set', field: 'rating', value: null }])
	})

	it('treats operation-shaped field data as a replacement value', () => {
		expect(
			normalizeUpdateExpression(accountSchema, {
				operationLike: { kind: 'increment', value: 2 },
			}).operations,
		).toStrictEqual([
			{
				kind: 'set',
				field: 'operationLike',
				value: { kind: 'increment', value: 2 },
			},
		])
	})

	it('rejects malformed expression shapes and values', () => {
		expect(() => {
			// @ts-expect-error -- Runtime normalization protects JavaScript callers.
			normalizeUpdateExpression(accountSchema, null)
		}).toThrow(new TypeError('update expression must be an object'))
		expect(() => {
			// @ts-expect-error -- Update data must be a field map.
			normalizeUpdateExpression(accountSchema, [])
		}).toThrow(new TypeError('update expression must be an object'))
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				// @ts-expect-error -- Source typing rejects unknown update fields.
				multiply: { increment: 2 },
			})
		}).toThrow(new TypeError('update field must reference a schema field'))
		expect(() => {
			// @ts-expect-error -- A required field is missing; Runtime still rejects empty input.
			normalizeUpdateExpression(accountSchema, {})
		}).toThrow(
			new TypeError('update expression must contain at least one operation'),
		)
		expect(() => {
			// This assertion simulates an untyped JavaScript boundary.
			// @ts-expect-error -- Source typing rejects undefined required values.
			normalizeUpdateExpression(accountSchema, {
				name: undefined,
			})
		}).toThrow(new TypeError('update value must not be undefined'))
	})

	it('rejects unknown, immutable, and system fields', () => {
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				// @ts-expect-error -- Source typing rejects unknown update fields.
				missing: true,
			})
		}).toThrow(new TypeError('update field must reference a schema field'))
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				// @ts-expect-error -- Source typing rejects immutable update fields.
				lockedCounter: 1,
			})
		}).toThrow(
			new TypeError('update field must reference a mutable schema field'),
		)
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				// @ts-expect-error -- Source typing rejects system update fields.
				updatedAt: '2026-07-31T12:00:00.000Z',
			})
		}).toThrow(
			new TypeError('update field must reference a mutable schema field'),
		)
	})

	it('restricts arithmetic to scalar numeric fields and exact deltas', () => {
		// Non-numeric fields keep object values as replacements validated by Runtime.
		expect(
			normalizeUpdateExpression(accountSchema, {
				// @ts-expect-error -- Source typing rejects numeric deltas on strings.
				name: { increment: 1 },
			}).operations,
		).toStrictEqual([{ kind: 'set', field: 'name', value: { increment: 1 } }])
		expect(
			normalizeUpdateExpression(accountSchema, {
				// @ts-expect-error -- Source typing rejects numeric deltas on lists.
				scores: { increment: 1 },
			}).operations,
		).toStrictEqual([{ kind: 'set', field: 'scores', value: { increment: 1 } }])
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				// @ts-expect-error -- Source typing rejects string deltas on integers.
				visits: { increment: '1' },
			})
		}).toThrow(new TypeError('update increment value must be a safe integer'))
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				// The assertion simulates an untyped JavaScript boundary.
				rating: { decrement: null as unknown as number },
			})
		}).toThrow(new TypeError('update decrement value must be a number'))
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				// @ts-expect-error -- Exactly one operation key is accepted.
				visits: { increment: 1, decrement: 1 },
			})
		}).toThrow(
			new TypeError(
				'update field visits must contain exactly one of increment or decrement',
			),
		)
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				// @ts-expect-error -- Numeric fields have no other object values.
				visits: { multiply: 2 },
			})
		}).toThrow(
			new TypeError(
				'update field visits must contain exactly one of increment or decrement',
			),
		)
	})

	it('rejects malformed field definitions after resolving an owned key', () => {
		// Build the malformed boundary explicitly because spreading a class loses its prototype.
		const malformedSchema = {
			className: accountSchema.className,
			fields: { ...accountSchema.fields, visits: undefined },
			indexes: accountSchema.indexes,
		} as unknown as typeof accountSchema

		expect(() =>
			normalizeUpdateExpression(malformedSchema, {
				visits: { increment: 1 },
			}),
		).toThrow(new TypeError('update field must reference a field definition'))
	})
})
