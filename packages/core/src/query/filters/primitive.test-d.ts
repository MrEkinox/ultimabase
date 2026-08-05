import {
	bigintField,
	binaryField,
	booleanField,
	dateField,
	dateTimeField,
	decimalField,
	definePluginField,
	Schema,
	enumField,
	floatField,
	intField,
	jsonField,
	objectField,
	pointerField,
	stringField,
	timeField,
	uuidField,
	type Pointer,
} from '../../schema/index.js'
import { expect, expectTypeOf, test } from 'vitest'

import type {
	QueryComparisonFilterOperator,
	QueryEqualityFilterOperator,
	QueryMembershipFilterOperator,
	QueryPrimitiveFilterNode,
	QueryPrimitiveFilterOperator,
	QueryRegexPattern,
	QueryStringFilterOperator,
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
	fields: {},
})

const filterSchema = Schema.define({
	className: 'FilterMatrix',
	fields: {
		exactInteger: bigintField(),
		attachment: binaryField(),
		active: booleanField(),
		calendarDay: dateField(),
		created: dateTimeField(),
		price: decimalField(),
		status: enumField({ values: ['draft', 'published'] }),
		ratio: floatField(),
		count: intField(),
		payload: jsonField(),
		profile: objectField({ fields: { name: stringField() } }),
		author: pointerField({ target: () => pointerTargetSchema }),
		title: stringField(),
		aliases: stringField({ list: true }),
		reminder: timeField(),
		externalId: uuidField(),
		nullableCount: intField(),
		vector: vectorField,
	},
})

type EqualityOperators =
	QueryEqualityFilterOperator | QueryMembershipFilterOperator | 'null'

type OrderedOperators = EqualityOperators | QueryComparisonFilterOperator

type StringOperators = OrderedOperators | QueryStringFilterOperator | 'regex'

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
	expectTypeOf<Operators<'payload'>>().toEqualTypeOf<EqualityOperators>()
	expectTypeOf<Operators<'profile'>>().toEqualTypeOf<'null'>()
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
