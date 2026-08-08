import { expectTypeOf, test } from 'vitest'

import {
	pointerField,
	Schema,
	type InferCreateInput,
	type InferObject,
	type InferUpdateInput,
	type PointerField,
	type Pointer,
} from '../../index.js'
import type { InferQueryResult } from '../../../query/index.js'

const userSchema = Schema.define({ className: 'PointerFieldUser', fields: {} })
const postSchema = Schema.define({
	className: 'PointerFieldPost',
	fields: {
		author: pointerField({
			target: () => userSchema,
			validation: { required: true },
		}),
		reviewer: pointerField({
			target: () => userSchema,
			onDelete: 'setNull',
		}),
		owner: pointerField({
			target: () => userSchema,
			immutable: true,
		}),
	},
})

test('infers exact pointer values across every model mode', () => {
	type ObjectValue = InferObject<typeof postSchema>
	type CreateValue = InferCreateInput<typeof postSchema>
	type UpdateValue = InferUpdateInput<typeof postSchema>
	type SelectedValue = InferQueryResult<typeof postSchema, 'author'>

	expectTypeOf(postSchema.fields.author).toExtend<
		PointerField<typeof userSchema>
	>()
	expectTypeOf<ObjectValue['author']>().toEqualTypeOf<
		Pointer<typeof userSchema>
	>()
	expectTypeOf<CreateValue['author']>().toEqualTypeOf<
		Pointer<typeof userSchema>
	>()
	expectTypeOf<ObjectValue['reviewer']>().toEqualTypeOf<Pointer<
		typeof userSchema
	> | null>()
	expectTypeOf<CreateValue['reviewer']>().toEqualTypeOf<
		Pointer<typeof userSchema> | null | undefined
	>()
	expectTypeOf<UpdateValue['reviewer']>().toEqualTypeOf<
		Pointer<typeof userSchema> | null | undefined
	>()
	expectTypeOf<UpdateValue>().not.toHaveProperty('owner')
	expectTypeOf<SelectedValue['author']>().toEqualTypeOf<
		Pointer<typeof userSchema>
	>()
})

test('rejects incompatible pointer declarations and target values', () => {
	const otherSchema = Schema.define({
		className: 'OtherPointerTarget',
		fields: {},
	})

	// @ts-expect-error -- Collections use relationField instead of pointer lists.
	pointerField({ target: () => userSchema, list: true })
	pointerField({ target: () => userSchema, onDelete: 'setNull' })
	pointerField({
		target: () => userSchema,
		validation: {
			required: true,
			// @ts-expect-error -- Nullability is derived and cannot be configured.
			nullable: true,
		},
	})
	pointerField({
		target: () => userSchema,
		// @ts-expect-error -- Pointer defaults hide relationship creation intent.
		default: userSchema.pointer('user-1'),
	})
	pointerField({
		target: () => userSchema,
		hooks: {
			// @ts-expect-error -- Output transformation is not a field hook phase.
			resolveOutput: () => undefined,
		},
	})

	type CreateValue = InferCreateInput<typeof postSchema>
	const invalidCreate: CreateValue = {
		// @ts-expect-error -- The author pointer must target the exact User schema.
		author: otherSchema.pointer('other-1'),
	}
	void invalidCreate
})
