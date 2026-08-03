import { expectTypeOf, test } from 'vitest'

import {
	binaryField,
	booleanField,
	dateField,
	dateTimeField,
	decimalField,
	Schema,
	enumField,
	floatField,
	intField,
	jsonField,
	objectField,
	stringField,
	timeField,
	type InferCreateInput,
	type InferObject,
	type InferUpdateInput,
	type JsonDocument,
} from '../index.js'

const primitiveSchema = Schema.define({
	className: 'PrimitiveMatrix',
	fields: {
		requiredText: stringField({
			validation: { required: true },
		}),
		optionalText: stringField(),
		nullableText: stringField({
			validation: { nullable: true },
		}),
		defaultedFlag: booleanField({
			default: false,
		}),
		requiredDefault: stringField({
			validation: { required: true },
			default: 'generated',
		}),
		immutableText: stringField({
			validation: { required: true },
			immutable: true,
		}),
		sequence: intField({
			autoIncrement: true,
		}),
		ratio: floatField(),
		status: enumField({
			values: {
				Draft: 'draft',
				Published: 'published',
			},
			validation: { required: true },
		}),
		publishedAt: dateField(),
		processedAt: dateTimeField(),
		automaticDate: dateField({
			autoNow: true,
			validation: { required: true },
		}),
		reminderTime: timeField(),
		payload: jsonField(),
		attachment: binaryField(),
		price: decimalField(),
	},
})

test('infers the complete primitive output matrix', () => {
	interface ExpectedObject {
		readonly id: string
		readonly createdAt: string
		readonly updatedAt: string
		readonly requiredText: string
		readonly optionalText?: string
		readonly nullableText?: string | null
		readonly defaultedFlag: boolean
		readonly requiredDefault: string
		readonly immutableText: string
		readonly sequence: number
		readonly ratio?: number
		readonly status: 'draft' | 'published'
		readonly publishedAt?: string
		readonly processedAt?: string
		readonly automaticDate: string
		readonly reminderTime?: string
		readonly payload?: JsonDocument
		readonly attachment?: Uint8Array
		readonly price?: string
	}

	expectTypeOf(primitiveSchema.className).toEqualTypeOf<'PrimitiveMatrix'>()
	expectTypeOf<
		InferObject<typeof primitiveSchema>
	>().toEqualTypeOf<ExpectedObject>()
})

test('makes generated and defaulted values optional in create inputs', () => {
	interface ExpectedCreateInput {
		requiredText: string
		optionalText?: string
		nullableText?: string | null
		defaultedFlag?: boolean
		requiredDefault?: string
		immutableText: string
		sequence?: number
		ratio?: number
		status: 'draft' | 'published'
		publishedAt?: string
		processedAt?: string
		automaticDate?: string
		reminderTime?: string
		payload?: JsonDocument
		attachment?: Uint8Array
		price?: string
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
		optionalText?: string
		nullableText?: string | null
		defaultedFlag?: boolean
		requiredDefault?: string
		sequence?: number
		ratio?: number
		status?: 'draft' | 'published'
		publishedAt?: string
		processedAt?: string
		automaticDate?: string
		reminderTime?: string
		payload?: JsonDocument
		attachment?: Uint8Array
		price?: string
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
	fields: {
		profile: objectField({
			validation: { required: true },
			fields: {
				name: stringField({
					validation: { required: true },
				}),
				bio: stringField({
					validation: { nullable: true },
				}),
				active: booleanField({
					default: true,
				}),
				internalCode: stringField({
					immutable: true,
				}),
			},
		}),
		members: objectField({
			list: true,
			validation: { required: true },
			fields: {
				name: stringField({
					validation: { required: true },
				}),
				verified: booleanField({
					default: false,
				}),
			},
		}),
	},
})

test('recursively infers object list fields for every operation', () => {
	type ObjectShape = InferObject<typeof compositeSchema>
	type CreateShape = InferCreateInput<typeof compositeSchema>
	type UpdateShape = InferUpdateInput<typeof compositeSchema>

	expectTypeOf(compositeSchema.className).toEqualTypeOf<'CompositeMatrix'>()
	expectTypeOf<ObjectShape['profile']>().toEqualTypeOf<{
		readonly name: string
		readonly bio?: string | null
		readonly active: boolean
		readonly internalCode?: string
	}>()
	expectTypeOf<CreateShape['profile']>().toEqualTypeOf<{
		name: string
		bio?: string | null
		active?: boolean
		internalCode?: string
	}>()
	expectTypeOf<NonNullable<UpdateShape['profile']>>().toEqualTypeOf<{
		name?: string
		bio?: string | null
		active?: boolean
	}>()

	expectTypeOf<ObjectShape['members']>().toEqualTypeOf<
		readonly {
			readonly name: string
			readonly verified: boolean
		}[]
	>()
	expectTypeOf<CreateShape['members']>().toEqualTypeOf<
		readonly {
			name: string
			verified?: boolean
		}[]
	>()
	expectTypeOf<NonNullable<UpdateShape['members']>>().toEqualTypeOf<
		readonly {
			name: string
			verified?: boolean
		}[]
	>()
})
