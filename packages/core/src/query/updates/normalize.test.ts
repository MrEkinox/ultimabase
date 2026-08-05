import {
	bigintField,
	dateTimeField,
	decimalField,
	Schema,
	floatField,
	intField,
	stringField,
} from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { normalizeUpdateExpression } from './normalize.js'

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
		lockedCounter: intField({ immutable: true }),
	},
})

describe('normalizeUpdateExpression', () => {
	it('normalizes every operator in deterministic immutable group order', () => {
		const expression = normalizeUpdateExpression(accountSchema, {
			decrement: { rating: 0.5, sequence: 1n },
			increment: { visits: 2, balance: '1.25' },
			set: { name: 'Updated account', nickname: null },
		})

		expect(expression).toStrictEqual({
			kind: 'update-expression',
			operations: [
				{ kind: 'set', field: 'name', value: 'Updated account' },
				{ kind: 'set', field: 'nickname', value: null },
				{ kind: 'increment', field: 'visits', value: 2 },
				{ kind: 'increment', field: 'balance', value: '1.25' },
				{ kind: 'decrement', field: 'rating', value: 0.5 },
				{ kind: 'decrement', field: 'sequence', value: 1n },
			],
		})
		expect(Object.isFrozen(expression)).toBe(true)
		expect(Object.isFrozen(expression.operations)).toBe(true)
		expect(
			expression.operations.every((operation) => Object.isFrozen(operation)),
		).toBe(true)

		// Optional fields clear through the same replacement operation as other values.
		expect(
			normalizeUpdateExpression(accountSchema, { set: { rating: null } })
				.operations,
		).toStrictEqual([{ kind: 'set', field: 'rating', value: null }])
	})

	it('rejects conflicting operations on the same field', () => {
		expect(() =>
			normalizeUpdateExpression(accountSchema, {
				set: { visits: 10 },
				increment: { visits: 1 },
			}),
		).toThrow(
			new TypeError('update field visits cannot use more than one operation'),
		)
		expect(() =>
			normalizeUpdateExpression(accountSchema, {
				increment: { visits: 1 },
				decrement: { visits: 1 },
			}),
		).toThrow(
			new TypeError('update field visits cannot use more than one operation'),
		)
	})

	it('rejects malformed expression and operator group shapes', () => {
		expect(() => {
			// @ts-expect-error -- Runtime normalization protects JavaScript callers.
			normalizeUpdateExpression(accountSchema, null)
		}).toThrow(new TypeError('update expression must be an object'))
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				set: { name: 'Account' },
				// @ts-expect-error -- Unknown groups cannot enter the normalized AST.
				multiply: { visits: 2 },
			})
		}).toThrow(
			new TypeError('update expression contains unknown group: multiply'),
		)
		expect(() => {
			// @ts-expect-error -- Set values require a field map.
			normalizeUpdateExpression(accountSchema, { set: [] })
		}).toThrow(new TypeError('update set must be an object'))
		expect(() => {
			// @ts-expect-error -- Numeric operators require field maps.
			normalizeUpdateExpression(accountSchema, { increment: [] })
		}).toThrow(new TypeError('update increment must be an object'))
		expect(() => {
			// @ts-expect-error -- At least one group is required statically.
			normalizeUpdateExpression(accountSchema, {})
		}).toThrow(
			new TypeError('update expression must contain at least one operation'),
		)
		expect(() => normalizeUpdateExpression(accountSchema, { set: {} })).toThrow(
			new TypeError('update expression must contain at least one operation'),
		)
	})

	it('rejects unknown, immutable, system, undefined, and required null fields', () => {
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				// @ts-expect-error -- Unknown fields are rejected statically and at runtime.
				set: { missing: true },
			})
		}).toThrow(new TypeError('update set field must reference a schema field'))
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				// @ts-expect-error -- Immutable fields cannot be updated.
				set: { lockedCounter: 1 },
			})
		}).toThrow(
			new TypeError('update set field must reference a mutable schema field'),
		)
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				// @ts-expect-error -- System fields cannot be updated.
				set: { updatedAt: '2026-07-31T12:00:00.000Z' },
			})
		}).toThrow(
			new TypeError('update set field must reference a mutable schema field'),
		)
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				// @ts-expect-error -- Undefined means no set operation, never a value.
				set: {
					name: undefined,
				},
			})
		}).toThrow(new TypeError('update set value must not be undefined'))
	})

	it('restricts arithmetic to scalar numeric fields and exact deltas', () => {
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				// @ts-expect-error -- Strings do not expose arithmetic operators.
				increment: { name: 1 },
			})
		}).toThrow(
			new TypeError(
				'update increment field must reference a mutable scalar numeric field',
			),
		)
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				// @ts-expect-error -- Numeric lists are replaced through set instead.
				increment: { scores: 1 },
			})
		}).toThrow(
			new TypeError(
				'update increment field must reference a mutable scalar numeric field',
			),
		)
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				increment: {
					// @ts-expect-error -- Integer deltas must remain safe integers.
					visits: '1',
				},
			})
		}).toThrow(new TypeError('update increment value must be a safe integer'))
		expect(() => {
			normalizeUpdateExpression(accountSchema, {
				decrement: {
					// @ts-expect-error -- Nullable fields still require non-null deltas.
					rating: null,
				},
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
				increment: { visits: 1 },
			}),
		).toThrow(
			new TypeError('update increment field must reference a field definition'),
		)
	})
})
