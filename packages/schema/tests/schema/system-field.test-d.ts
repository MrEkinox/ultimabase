import { expectTypeOf, test } from 'vitest'

import {
	defineSchema,
	type FieldValue,
	type IdSystemField,
	type ReservedSystemFieldName,
	type SystemFieldGeneration,
	type SystemFields,
} from '../../src/index.js'

type FieldsWithOption<TFields, TOption extends PropertyKey, TValue> = {
	[TKey in keyof TFields]: TFields[TKey] extends {
		readonly options: Record<TOption, TValue>
	}
		? TKey
		: never
}[keyof TFields]

test('exposes system values in every schema field map', () => {
	const schema = defineSchema({
		className: 'Post',
		fields: {},
	})

	expectTypeOf<keyof typeof schema.fields>().toEqualTypeOf<
		'createdAt' | 'id' | 'updatedAt'
	>()
	expectTypeOf<FieldValue<typeof schema.fields.id>>().toEqualTypeOf<string>()
	expectTypeOf<
		FieldValue<typeof schema.fields.createdAt>
	>().toEqualTypeOf<string>()
	expectTypeOf<
		FieldValue<typeof schema.fields.updatedAt>
	>().toEqualTypeOf<string>()
	expectTypeOf(schema.fields.id).toEqualTypeOf<IdSystemField>()
	expectTypeOf(schema.fields).toExtend<SystemFields>()
})

test('marks generated and immutable fields for create and update inference', () => {
	const schema = defineSchema({
		className: 'Post',
		fields: {},
	})

	// Issue 112 can derive input exclusions from metadata instead of reserved names.
	expectTypeOf<
		FieldsWithOption<typeof schema.fields, 'generatedOn', SystemFieldGeneration>
	>().toEqualTypeOf<ReservedSystemFieldName>()
	expectTypeOf<
		FieldsWithOption<typeof schema.fields, 'immutable', true>
	>().toEqualTypeOf<ReservedSystemFieldName>()
	expectTypeOf(schema.fields.id.options.generatedOn).toEqualTypeOf<'create'>()
	expectTypeOf(schema.fields.id.options.uuidVersion).toEqualTypeOf<7>()
	expectTypeOf(
		schema.fields.updatedAt.options.generatedOn,
	).toEqualTypeOf<'createAndUpdate'>()
})
