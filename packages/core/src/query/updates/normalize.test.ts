import {
	bigintField,
	dateTimeField,
	decimalField,
	Schema,
	floatField,
	intField,
	objectField,
	stringField,
} from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { decrement, increment, unset } from './operators.js'
import { normalizeUpdateExpression } from './normalize.js'
import type { UpdateExpressionInput } from './contracts.js'

const accountSchema = Schema.define({
	className: 'Account',
	fields: {
		name: stringField({ validation: { required: true } }),
		nickname: stringField(),
		visits: intField(),
		rating: floatField(),
		balance: decimalField(),
		sequence: bigintField(),
		serial: intField({ autoIncrement: true }),
		refreshedAt: dateTimeField({ autoNow: true }),
		scores: intField({ list: true }),
		operationLike: objectField({
			fields: {
				kind: stringField({ validation: { required: true } }),
				value: intField({ validation: { required: true } }),
			},
		}),
		lockedCounter: intField({ immutable: true }),
	},
})

describe('normalizeUpdateExpression', () => {
	it('normalizes field values in deterministic declaration order', () => {
		const expression = normalizeUpdateExpression(accountSchema, {
			rating: decrement(0.5),
			visits: increment(2),
			balance: increment('1.25'),
			name: 'Updated account',
			nickname: unset(),
			sequence: decrement(1n),
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
		expect(Object.isFrozen(increment(1))).toBe(true)

		// The explicit helper remains exactly the canonical null replacement.
		expect(
			normalizeUpdateExpression(accountSchema, { rating: unset() }).operations,
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
				// @ts-expect-error -- Unknown fields cannot enter the normalized AST.
				multiply: increment(2),
			})
		}).toThrow(
			new TypeError('update increment field must reference a schema field'),
		)
		expect(() => {
			// @ts-expect-error -- At least one changed field is required statically.
			normalizeUpdateExpression(accountSchema, {})
		}).toThrow(
			new TypeError('update expression must contain at least one operation'),
		)
		expect(() => {
			// This assertion simulates an untyped JavaScript boundary.
			normalizeUpdateExpression(accountSchema, {
				name: undefined,
			} as unknown as UpdateExpressionInput<typeof accountSchema>)
		}).toThrow(new TypeError('update value must not be undefined'))
	})

	it('rejects unknown, immutable, and system fields', () => {
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				// @ts-expect-error -- Unknown fields are rejected statically and at runtime.
				missing: true,
			})
		}).toThrow(new TypeError('update field must reference a schema field'))
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				// @ts-expect-error -- Immutable fields cannot be updated.
				lockedCounter: 1,
			})
		}).toThrow(
			new TypeError('update field must reference a mutable schema field'),
		)
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				// @ts-expect-error -- System fields cannot be updated.
				updatedAt: '2026-07-31T12:00:00.000Z',
			})
		}).toThrow(
			new TypeError('update field must reference a mutable schema field'),
		)
	})

	it('restricts arithmetic to scalar numeric fields and exact deltas', () => {
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				// @ts-expect-error -- Strings do not expose arithmetic operations.
				name: increment(1),
			})
		}).toThrow(
			new TypeError(
				'update increment field must reference a mutable scalar numeric field',
			),
		)
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				// @ts-expect-error -- Numeric lists are replaced directly instead.
				scores: increment(1),
			})
		}).toThrow(
			new TypeError(
				'update increment field must reference a mutable scalar numeric field',
			),
		)
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				// @ts-expect-error -- Integer deltas must remain safe integers.
				visits: increment('1'),
			})
		}).toThrow(new TypeError('update increment value must be a safe integer'))
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				// The assertion simulates an untyped JavaScript boundary.
				rating: decrement(null as unknown as number),
			})
		}).toThrow(new TypeError('update decrement value must be a number'))
	})

	it('rejects malformed field definitions after resolving an owned key', () => {
		// Build the malformed boundary explicitly because spreading a class loses its prototype.
		const malformedSchema = {
			className: accountSchema.className,
			extensions: accountSchema.extensions,
			fields: { ...accountSchema.fields, visits: undefined },
			indexes: accountSchema.indexes,
		} as unknown as typeof accountSchema

		expect(() =>
			normalizeUpdateExpression(malformedSchema, {
				visits: increment(1),
			}),
		).toThrow(
			new TypeError('update increment field must reference a field definition'),
		)
	})
})
