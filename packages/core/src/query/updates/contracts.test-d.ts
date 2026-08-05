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
import { expect, expectTypeOf, test } from 'vitest'

import {
	decrement,
	increment,
	normalizeUpdateExpression,
	unset,
	type NumericUpdateFieldName,
	type SetUpdateOperationNode,
	type UpdateExpression,
	type UpdateFieldName,
	type UpdateOneOperationAst,
} from '../index.js'

const articleSchema = Schema.define({
	className: 'Article',
	fields: {
		title: stringField({ validation: { required: true } }),
		summary: stringField(),
		status: stringField({ default: 'draft' }),
		views: intField(),
		rating: floatField(),
		balance: decimalField(),
		sequence: bigintField(),
		serial: intField({ autoIncrement: true }),
		scores: intField({ list: true }),
		publishedAt: dateTimeField({ autoNow: true }),
		metadata: objectField({
			fields: { label: stringField({ validation: { required: true } }) },
		}),
		lockedCounter: intField({ immutable: true }),
	},
})

test('infers mutable and numeric fields independently', () => {
	expectTypeOf<UpdateFieldName<typeof articleSchema>>().toEqualTypeOf<
		| 'title'
		| 'summary'
		| 'status'
		| 'views'
		| 'rating'
		| 'balance'
		| 'sequence'
		| 'serial'
		| 'scores'
		| 'publishedAt'
		| 'metadata'
	>()
	expectTypeOf<NumericUpdateFieldName<typeof articleSchema>>().toEqualTypeOf<
		'views' | 'rating' | 'balance' | 'sequence' | 'serial'
	>()
})

test('correlates each field with its exact value or operation type', () => {
	const expression = normalizeUpdateExpression(articleSchema, {
		metadata: { label: 'Query' },
		rating: decrement(0.5),
		summary: unset(),
		title: 'Typed updates',
		views: increment(1),
		balance: increment('1.25'),
		sequence: increment(1n),
	})

	expectTypeOf(expression).toEqualTypeOf<
		UpdateExpression<typeof articleSchema>
	>()
	expectTypeOf<
		UpdateOneOperationAst<typeof articleSchema>['update']
	>().toEqualTypeOf<UpdateExpression<typeof articleSchema>>()
	expectTypeOf<
		Extract<
			SetUpdateOperationNode<typeof articleSchema>,
			{ readonly field: 'views' }
		>['value']
	>().toEqualTypeOf<number | null>()
	expectTypeOf(unset()).toEqualTypeOf<null>()
	expect(expression.kind).toBe('update-expression')
})

test('rejects incompatible fields and values at compile time', () => {
	// @ts-expect-error -- At least one changed field is required.
	normalizeUpdateExpression(articleSchema, {})

	normalizeUpdateExpression(articleSchema, {
		// @ts-expect-error -- System fields are never developer-updatable.
		id: '0194f292-0dd9-7c2d-a0a3-a2f755a3d90a',
	})
	normalizeUpdateExpression(articleSchema, {
		// @ts-expect-error -- Immutable fields are omitted from update inference.
		lockedCounter: 1,
	})
	normalizeUpdateExpression(articleSchema, {
		// @ts-expect-error -- Replacement values remain correlated with fields.
		views: 'one',
	})
	normalizeUpdateExpression(articleSchema, {
		// @ts-expect-error -- Required output fields cannot be cleared.
		title: unset(),
	})
	normalizeUpdateExpression(articleSchema, {
		// @ts-expect-error -- Numeric lists do not support scalar arithmetic.
		scores: increment(1),
	})
	normalizeUpdateExpression(articleSchema, {
		// @ts-expect-error -- Decimal deltas remain exact strings.
		balance: increment(1.25),
	})
	// @ts-expect-error -- Arithmetic helpers reject null deltas.
	decrement(null)
})
