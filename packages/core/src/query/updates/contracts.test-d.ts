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
	normalizeUpdateExpression,
	type NumericUpdateFieldName,
	type SetUpdateOperationNode,
	type UnsetUpdateFieldName,
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
		rating: floatField({ validation: { nullable: true } }),
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

test('infers mutable, numeric, and unsettable fields independently', () => {
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
	expectTypeOf<UnsetUpdateFieldName<typeof articleSchema>>().toEqualTypeOf<
		| 'summary'
		| 'views'
		| 'rating'
		| 'balance'
		| 'sequence'
		| 'scores'
		| 'metadata'
	>()
})

test('correlates each operator field with its exact value type', () => {
	const expression = normalizeUpdateExpression(articleSchema, {
		set: {
			title: 'Typed updates',
			rating: null,
			metadata: { label: 'Query' },
		},
		unset: ['summary'],
		increment: {
			views: 1,
			balance: '1.25',
			sequence: 1n,
		},
		decrement: { rating: 0.5 },
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
	>().toEqualTypeOf<number>()
	expect(expression.kind).toBe('update-expression')
})

test('rejects incompatible fields and values at compile time', () => {
	// @ts-expect-error -- At least one operator group is required.
	normalizeUpdateExpression(articleSchema, {})

	normalizeUpdateExpression(articleSchema, {
		set: {
			// @ts-expect-error -- System fields are never developer-updatable.
			id: '0194f292-0dd9-7c2d-a0a3-a2f755a3d90a',
		},
	})
	normalizeUpdateExpression(articleSchema, {
		set: {
			// @ts-expect-error -- Immutable fields are omitted from update inference.
			lockedCounter: 1,
		},
	})
	normalizeUpdateExpression(articleSchema, {
		set: {
			// @ts-expect-error -- Set values remain correlated with their fields.
			views: 'one',
		},
	})
	normalizeUpdateExpression(articleSchema, {
		// @ts-expect-error -- Required output fields cannot be unset.
		unset: ['title'],
	})
	normalizeUpdateExpression(articleSchema, {
		// @ts-expect-error -- Defaulted output fields cannot be unset.
		unset: ['status'],
	})
	normalizeUpdateExpression(articleSchema, {
		// @ts-expect-error -- Numeric lists do not support scalar arithmetic.
		increment: { scores: 1 },
	})
	normalizeUpdateExpression(articleSchema, {
		increment: {
			// @ts-expect-error -- Decimal deltas remain exact strings.
			balance: 1.25,
		},
	})
	normalizeUpdateExpression(articleSchema, {
		decrement: {
			// @ts-expect-error -- Nullable fields still reject null arithmetic deltas.
			rating: null,
		},
	})
})
