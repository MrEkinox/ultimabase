import { definePluginField, Schema, type Pointer } from '../../schema/index.js'
import { expect, expectTypeOf, test } from 'vitest'

import type {
	QueryComparisonFilterOperator,
	QueryEqualityFilterOperator,
	QueryMembershipFilterOperator,
	QueryJsonPathFilterOperator,
	QueryKeyFilterOperator,
	QueryPrimitiveFilterNode,
	QueryPrimitiveFilterOperator,
	QueryRangeFilterOperator,
	QueryRegexPattern,
	QueryStringFilterOperator,
	QueryStructuralContainmentFilterOperator,
} from '../index.js'

const vectorField = definePluginField(
	'fixture.vector',
	{},
	{
		// The fixture keeps plugin field behavior outside the built-in operator matrix.
		snapshotValue: (): readonly number[] => [],
	},
)

const pointerTargetSchema = Schema.define({
	className: 'FilterPointerTarget',
	fields: () => ({}),
})

const filterSchema = Schema.define({
	className: 'FilterMatrix',
	fields: (field) => ({
		exactInteger: field.bigint(),
		attachment: field.binary(),
		active: field.boolean(),
		calendarDay: field.date(),
		created: field.dateTime(),
		price: field.decimal(),
		status: field.enum({ values: ['draft', 'published'] }),
		ratio: field.float(),
		count: field.int(),
		payload: field.json(),
		profile: field.object({ fields: (field) => ({ name: field.string() }) }),
		author: field.pointer({ target: () => pointerTargetSchema }),
		title: field.string(),
		aliases: field.string({ list: true }),
		reminder: field.time(),
		externalId: field.uuid(),
		nullableCount: field.int(),
		vector: vectorField,
	}),
})

type EqualityOperators =
	QueryEqualityFilterOperator | QueryMembershipFilterOperator | 'null'

type OrderedOperators =
	EqualityOperators | QueryComparisonFilterOperator | QueryRangeFilterOperator

type StringOperators = OrderedOperators | QueryStringFilterOperator | 'regex'

type StructuredOperators =
	| QueryJsonPathFilterOperator
	| QueryKeyFilterOperator
	| QueryStructuralContainmentFilterOperator

type Operators<TFieldName extends keyof typeof filterSchema.fields> =
	QueryPrimitiveFilterOperator<typeof filterSchema, TFieldName>

test('restricts every built-in field kind to its portable operators', () => {
	expect(filterSchema.className).toBe('FilterMatrix')
	expectTypeOf<Operators<'exactInteger'>>().toEqualTypeOf<OrderedOperators>()
	expectTypeOf<Operators<'attachment'>>().toEqualTypeOf<EqualityOperators>()
	expectTypeOf<Operators<'active'>>().toEqualTypeOf<EqualityOperators>()
	expectTypeOf<Operators<'calendarDay'>>().toEqualTypeOf<OrderedOperators>()
	expectTypeOf<Operators<'created'>>().toEqualTypeOf<OrderedOperators>()
	expectTypeOf<Operators<'price'>>().toEqualTypeOf<OrderedOperators>()
	expectTypeOf<Operators<'status'>>().toEqualTypeOf<EqualityOperators>()
	expectTypeOf<Operators<'ratio'>>().toEqualTypeOf<OrderedOperators>()
	expectTypeOf<Operators<'count'>>().toEqualTypeOf<OrderedOperators>()
	expectTypeOf<Operators<'payload'>>().toEqualTypeOf<
		EqualityOperators | StructuredOperators
	>()
	expectTypeOf<Operators<'profile'>>().toEqualTypeOf<
		StructuredOperators | 'null'
	>()
	expectTypeOf<Operators<'author'>>().toEqualTypeOf<EqualityOperators>()
	expectTypeOf<Operators<'title'>>().toEqualTypeOf<StringOperators>()
	expectTypeOf<Operators<'aliases'>>().toEqualTypeOf<'null'>()
	expectTypeOf<Operators<'reminder'>>().toEqualTypeOf<OrderedOperators>()
	expectTypeOf<Operators<'externalId'>>().toEqualTypeOf<EqualityOperators>()
	expectTypeOf<Operators<'vector'>>().toEqualTypeOf<'null'>()
	expectTypeOf<Operators<'id'>>().toEqualTypeOf<EqualityOperators>()
	expectTypeOf<Operators<'createdAt'>>().toEqualTypeOf<OrderedOperators>()
})

test('correlates operands with exact inferred field values', () => {
	type Filters = QueryPrimitiveFilterNode<typeof filterSchema>

	expectTypeOf<{
		readonly kind: 'equal'
		readonly field: 'active'
		readonly value: true
	}>().toExtend<Filters>()
	expectTypeOf<{
		readonly kind: 'greater-than'
		readonly field: 'count'
		readonly value: 10
	}>().toExtend<Filters>()
	expectTypeOf<{
		readonly kind: 'between'
		readonly field: 'count'
		readonly lower: 10
		readonly upper: 20
	}>().toExtend<Filters>()
	expectTypeOf<{
		readonly kind: 'not-between'
		readonly field: 'nullableCount'
		readonly lower: null
		readonly upper: 20
	}>().not.toExtend<Filters>()
	expectTypeOf<{
		readonly kind: 'in'
		readonly field: 'status'
		readonly values: readonly ['draft', 'published']
	}>().toExtend<Filters>()
	expectTypeOf<{
		readonly kind: 'equal'
		readonly field: 'nullableCount'
		readonly value: null
	}>().toExtend<Filters>()
	expectTypeOf<{
		readonly kind: 'equal'
		readonly field: 'attachment'
		readonly value: Uint8Array
	}>().toExtend<Filters>()
	expectTypeOf<{
		readonly kind: 'null'
		readonly field: 'profile'
		readonly isNull: true
	}>().toExtend<Filters>()
	expectTypeOf<{
		readonly kind: 'equal'
		readonly field: 'author'
		readonly value: Pointer<typeof pointerTargetSchema>
	}>().toExtend<Filters>()
	expectTypeOf<{
		readonly kind: 'contains'
		readonly field: 'profile'
		readonly value: { readonly name: 'Ada' }
	}>().toExtend<Filters>()
	expectTypeOf<{
		readonly kind: 'equal'
		readonly field: 'profile'
		readonly path: readonly ['name']
		readonly value: 'Ada'
	}>().toExtend<Filters>()
	expectTypeOf<{
		readonly kind: 'has-key'
		readonly field: 'profile'
		readonly value: 'name'
	}>().toExtend<Filters>()
	expectTypeOf<{
		readonly kind: 'json-path-exists'
		readonly field: 'payload'
		readonly source: '$.items[*]'
		readonly variables: { readonly minimum: 10 }
	}>().toExtend<Filters>()

	expectTypeOf<{
		readonly kind: 'equal'
		readonly field: 'active'
		readonly value: 'true'
	}>().not.toExtend<Filters>()
	expectTypeOf<{
		readonly kind: 'greater-than'
		readonly field: 'nullableCount'
		readonly value: null
	}>().not.toExtend<Filters>()
	expectTypeOf<{
		readonly kind: 'in'
		readonly field: 'status'
		readonly values: readonly ['archived']
	}>().not.toExtend<Filters>()
	expectTypeOf<{
		readonly kind: 'equal'
		readonly field: 'aliases'
		readonly value: readonly ['alias']
	}>().not.toExtend<Filters>()
	expectTypeOf<{
		readonly kind: 'equal'
		readonly field: 'vector'
		readonly value: readonly [1, 2, 3]
	}>().not.toExtend<Filters>()
	expectTypeOf<{
		readonly kind: 'equal'
		readonly field: 'profile'
		readonly path: readonly ['name']
		readonly value: 42
	}>().not.toExtend<Filters>()
	expectTypeOf<{
		readonly kind: 'has-key'
		readonly field: 'profile'
		readonly value: 'missing'
	}>().not.toExtend<Filters>()
})

test('keeps string matching and regex patterns declarative', () => {
	type TitleFilters = QueryPrimitiveFilterNode<typeof filterSchema, 'title'>

	expectTypeOf<{
		readonly kind: 'starts-with'
		readonly field: 'title'
		readonly value: 'Ultima'
	}>().toExtend<TitleFilters>()
	expectTypeOf<{
		readonly kind: 'regex'
		readonly field: 'title'
		readonly pattern: {
			readonly source: '^ultima'
			readonly flags: readonly ['case-insensitive']
		}
	}>().toExtend<TitleFilters>()
	expectTypeOf<{
		readonly kind: 'regex'
		readonly field: 'title'
		readonly pattern: RegExp
	}>().not.toExtend<TitleFilters>()
	expectTypeOf<{
		readonly source: 'ultima'
		readonly flags: readonly ['global']
	}>().not.toExtend<QueryRegexPattern>()

	const immutableFilter: TitleFilters = {
		kind: 'contains',
		field: 'title',
		value: 'base',
	}

	// @ts-expect-error -- Normalized filter nodes cannot change after construction.
	immutableFilter.value = 'database'
})
