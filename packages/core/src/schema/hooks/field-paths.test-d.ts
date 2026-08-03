import { expectTypeOf, test } from 'vitest'

import {
	definePluginField,
	type FieldAtPath,
	type FieldValue,
	type GenericField,
	objectField,
	Schema,
	type SchemaDefinition,
	type SchemaFieldPath,
	stringField,
} from '../index.js'

const customNormalizers = {
	snapshotValue: (value: unknown): URL => new URL(String(value)),
}

const schema = Schema.define({
	className: 'TypedFieldPath',
	fields: {
		'dotted.name': stringField(),
		profile: objectField({
			list: true,
			fields: {
				email: stringField({ validation: { required: true } }),
				provider: definePluginField('fixture.url', {}, customNormalizers),
			},
		}),
		title: stringField(),
	},
})

test('infers exact top-level, nested, custom, listed-object, and system paths', () => {
	expectTypeOf<readonly ['title']>().toExtend<SchemaFieldPath<typeof schema>>()
	expectTypeOf<readonly ['profile', 'email']>().toExtend<
		SchemaFieldPath<typeof schema>
	>()
	expectTypeOf<readonly ['profile', 'provider']>().toExtend<
		SchemaFieldPath<typeof schema>
	>()
	expectTypeOf<readonly ['dotted.name']>().toExtend<
		SchemaFieldPath<typeof schema>
	>()
	expectTypeOf<readonly ['id']>().toExtend<SchemaFieldPath<typeof schema>>()

	expectTypeOf<
		FieldAtPath<typeof schema, readonly ['profile', 'email']>
	>().toEqualTypeOf<typeof schema.fields.profile.options.fields.email>()
	expectTypeOf<
		FieldValue<FieldAtPath<typeof schema, readonly ['profile', 'provider']>>
	>().toEqualTypeOf<URL>()
	expectTypeOf(schema.fields.id).toEqualTypeOf<
		FieldAtPath<typeof schema, readonly ['id']>
	>()
})

test('rejects empty, unknown, numeric, and scalar-traversal paths', () => {
	type EmptyPath = FieldAtPath<typeof schema, readonly []>
	type UnknownPath = FieldAtPath<typeof schema, readonly ['missing']>
	// @ts-expect-error -- Path segments are field names rather than array offsets.
	type NumericPath = FieldAtPath<typeof schema, readonly [0]>
	type ScalarTraversal = FieldAtPath<
		typeof schema,
		readonly ['title', 'nested']
	>

	expectTypeOf<EmptyPath>().toBeNever()
	expectTypeOf<UnknownPath>().toBeNever()
	expectTypeOf<NumericPath>().toBeNever()
	expectTypeOf<ScalarTraversal>().toBeNever()

	const acceptPath = (path: SchemaFieldPath<typeof schema>): void => {
		void path
	}

	// @ts-expect-error -- Public paths must contain one field name.
	acceptPath([])
	// @ts-expect-error -- Exact schemas reject undeclared top-level fields.
	acceptPath(['missing'])
	// @ts-expect-error -- Path segments never represent array offsets.
	acceptPath([0])
	// @ts-expect-error -- Scalar fields cannot contain nested declarations.
	acceptPath(['title', 'nested'])
})

test('keeps widened schema paths safe without inventing terminal metadata', () => {
	expectTypeOf<SchemaFieldPath<SchemaDefinition>>().toEqualTypeOf<
		readonly [string, ...string[]]
	>()
	expectTypeOf<
		FieldAtPath<SchemaDefinition, readonly ['runtime', 'path']>
	>().toEqualTypeOf<GenericField>()
})
