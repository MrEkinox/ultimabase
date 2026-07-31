import { expectTypeOf, test } from 'vitest'

import {
	defineSchema,
	uuidField,
	type InferCreateInput,
	type InferObject,
	type InferUpdateInput,
	type UuidField,
	type UuidVersion,
} from '../src/index.js'

const uuidSchema = defineSchema({
	className: 'UuidRecord',
	fields: {
		ownerId: uuidField({
			validation: {
				required: true,
				version: 7,
			},
		}),
		externalId: uuidField({
			default: '550e8400-e29b-41d4-a716-446655440000',
		}),
		relatedIds: uuidField({ list: true }),
	},
})

test('preserves UUID literals and operation-specific inference', () => {
	type ObjectShape = InferObject<typeof uuidSchema>
	type CreateShape = InferCreateInput<typeof uuidSchema>
	type UpdateShape = InferUpdateInput<typeof uuidSchema>

	expectTypeOf(uuidSchema.fields.ownerId).toExtend<UuidField>()
	expectTypeOf(
		uuidSchema.fields.ownerId.options.validation.version,
	).toEqualTypeOf<7>()
	expectTypeOf<UuidVersion>().toEqualTypeOf<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8>()
	expectTypeOf<ObjectShape['ownerId']>().toEqualTypeOf<string>()
	expectTypeOf<ObjectShape['externalId']>().toEqualTypeOf<string>()
	expectTypeOf<ObjectShape['relatedIds']>().toEqualTypeOf<
		readonly string[] | undefined
	>()
	expectTypeOf<CreateShape['ownerId']>().toEqualTypeOf<string>()
	expectTypeOf<CreateShape['externalId']>().toEqualTypeOf<string | undefined>()
	expectTypeOf<UpdateShape['ownerId']>().toEqualTypeOf<string | undefined>()
})

test('rejects invalid UUID field declarations statically', () => {
	// @ts-expect-error -- UUID versions are restricted to their standard range.
	uuidField({ validation: { version: 9 } })

	// @ts-expect-error -- UUID defaults use their canonical string representation.
	uuidField({ default: 42 })

	// @ts-expect-error -- Required fields cannot also accept null.
	uuidField({ validation: { required: true, nullable: true } })
})
