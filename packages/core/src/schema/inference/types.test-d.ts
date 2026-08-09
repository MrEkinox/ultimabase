import { expectTypeOf, test } from 'vitest'

import {
	Schema,
	type InferCreateInput,
	type InferObject,
	type InferUpdateInput,
	type JsonDocument,
} from '../index.js'

const primitiveSchema = Schema.define({
	className: 'PrimitiveMatrix',
	fields: (field) => ({
		requiredText: field.string({
			validation: { required: true },
		}),
		optionalText: field.string(),
		nullableText: field.string(),
		defaultedFlag: field.boolean({
			default: false,
		}),
		requiredDefault: field.string({
			validation: { required: true },
			default: 'generated',
		}),
		immutableText: field.string({
			validation: { required: true },
			immutable: true,
		}),
		sequence: field.int({
			autoIncrement: true,
		}),
		ratio: field.float(),
		status: field.enum({
			values: {
				Draft: 'draft',
				Published: 'published',
			},
			validation: { required: true },
		}),
		publishedAt: field.date(),
		processedAt: field.dateTime(),
		automaticDate: field.date({
			autoNow: true,
			validation: { required: true },
		}),
		reminderTime: field.time(),
		payload: field.json(),
		attachment: field.binary(),
		price: field.decimal(),
	}),
})

test('infers the complete primitive output matrix', () => {
	interface ExpectedObject {
		readonly id: string
		readonly createdAt: string
		readonly updatedAt: string
		readonly requiredText: string
		readonly optionalText: string | null
		readonly nullableText: string | null
		readonly defaultedFlag: boolean | null
		readonly requiredDefault: string
		readonly immutableText: string
		readonly sequence: number
		readonly ratio: number | null
		readonly status: 'draft' | 'published'
		readonly publishedAt: string | null
		readonly processedAt: string | null
		readonly automaticDate: string
		readonly reminderTime: string | null
		readonly payload: JsonDocument | null
		readonly attachment: Uint8Array | null
		readonly price: string | null
	}

	expectTypeOf(primitiveSchema.className).toEqualTypeOf<'PrimitiveMatrix'>()
	expectTypeOf<
		InferObject<typeof primitiveSchema>
	>().toEqualTypeOf<ExpectedObject>()
})

test('makes generated and defaulted values optional in create inputs', () => {
	interface ExpectedCreateInput {
		requiredText: string
		optionalText?: string | null
		nullableText?: string | null
		defaultedFlag?: boolean | null
		requiredDefault?: string
		immutableText: string
		sequence?: number
		ratio?: number | null
		status: 'draft' | 'published'
		publishedAt?: string | null
		processedAt?: string | null
		automaticDate?: string
		reminderTime?: string | null
		payload?: JsonDocument | null
		attachment?: Uint8Array | null
		price?: string | null
	}

	type CreateInput = InferCreateInput<typeof primitiveSchema>

	expectTypeOf<CreateInput>().toEqualTypeOf<ExpectedCreateInput>()
	expectTypeOf<
		'id' extends keyof CreateInput ? true : false
	>().toEqualTypeOf<false>()
	expectTypeOf<
		'createdAt' extends keyof CreateInput ? true : false
	>().toEqualTypeOf<false>()
	expectTypeOf<
		'updatedAt' extends keyof CreateInput ? true : false
	>().toEqualTypeOf<false>()
})

test('makes mutable developer fields optional in update inputs', () => {
	interface ExpectedUpdateInput {
		requiredText?: string
		optionalText?: string | null
		nullableText?: string | null
		defaultedFlag?: boolean | null
		requiredDefault?: string
		sequence?: number
		ratio?: number | null
		status?: 'draft' | 'published'
		publishedAt?: string | null
		processedAt?: string | null
		automaticDate?: string
		reminderTime?: string | null
		payload?: JsonDocument | null
		attachment?: Uint8Array | null
		price?: string | null
	}

	type UpdateInput = InferUpdateInput<typeof primitiveSchema>

	expectTypeOf<UpdateInput>().toEqualTypeOf<ExpectedUpdateInput>()
	expectTypeOf<
		'immutableText' extends keyof UpdateInput ? true : false
	>().toEqualTypeOf<false>()
	expectTypeOf<
		'id' extends keyof UpdateInput ? true : false
	>().toEqualTypeOf<false>()
})

const compositeSchema = Schema.define({
	className: 'CompositeMatrix',
	fields: (field) => ({
		profile: field.object({
			validation: { required: true },
			fields: (field) => ({
				name: field.string({
					validation: { required: true },
				}),
				bio: field.string(),
				active: field.boolean({
					default: true,
				}),
				internalCode: field.string({
					immutable: true,
				}),
			}),
		}),
		members: field.object({
			list: true,
			validation: { required: true },
			fields: (field) => ({
				name: field.string({
					validation: { required: true },
				}),
				verified: field.boolean({
					default: false,
				}),
			}),
		}),
	}),
})

test('recursively infers object list fields for every operation', () => {
	type ObjectShape = InferObject<typeof compositeSchema>
	type CreateShape = InferCreateInput<typeof compositeSchema>
	type UpdateShape = InferUpdateInput<typeof compositeSchema>

	expectTypeOf(compositeSchema.className).toEqualTypeOf<'CompositeMatrix'>()
	expectTypeOf<ObjectShape['profile']>().toEqualTypeOf<{
		readonly name: string
		readonly bio: string | null
		readonly active: boolean | null
		readonly internalCode: string | null
	}>()
	expectTypeOf<CreateShape['profile']>().toEqualTypeOf<{
		name: string
		bio?: string | null
		active?: boolean | null
		internalCode?: string | null
	}>()
	expectTypeOf<NonNullable<UpdateShape['profile']>>().toEqualTypeOf<{
		name?: string
		bio?: string | null
		active?: boolean | null
	}>()

	expectTypeOf<ObjectShape['members']>().toEqualTypeOf<
		readonly {
			readonly name: string
			readonly verified: boolean | null
		}[]
	>()
	expectTypeOf<CreateShape['members']>().toEqualTypeOf<
		readonly {
			name: string
			verified?: boolean | null
		}[]
	>()
	expectTypeOf<NonNullable<UpdateShape['members']>>().toEqualTypeOf<
		readonly {
			name: string
			verified?: boolean | null
		}[]
	>()
})
