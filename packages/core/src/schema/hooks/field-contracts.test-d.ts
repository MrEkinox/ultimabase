import { expectTypeOf, test } from 'vitest'

import { objectField } from '../fields/builtins/object.js'
import { pointerField } from '../fields/builtins/pointer.js'
import { stringField } from '../fields/builtins/string.js'
import { Schema } from '../schema/definition.js'
import type {
	FieldHooks,
	FieldInputHookInput,
	FieldResolveInputHook,
} from './field-contracts.js'

const Target = Schema.define({
	className: 'FieldHookTarget',
	fields: (field) => ({ label: field.string() }),
})

test('infers exact scalar input values and operation branches', () => {
	const field = stringField({
		hooks: {
			resolveInput: (input) => {
				expectTypeOf(input.value).toEqualTypeOf<string | null>()
				expectTypeOf(input.kind).toEqualTypeOf<'create' | 'update' | 'upsert'>()
				expectTypeOf(input.mode).toEqualTypeOf<'create' | 'update'>()

				return input.value
			},
		},
	})

	expectTypeOf(field).toBeObject()
	type Input = FieldInputHookInput<typeof field>
	expectTypeOf<Input['value']>().toEqualTypeOf<string | null>()
})

test('preserves required and listed field values', () => {
	stringField({
		validation: { required: true },
		hooks: {
			resolveInput: ({ value }) => {
				expectTypeOf(value).toEqualTypeOf<string>()
				return value
			},
		},
	})

	stringField({
		list: true,
		hooks: {
			resolveInput: ({ value }) => {
				expectTypeOf(value).toEqualTypeOf<readonly string[] | null>()
				return value
			},
		},
	})
})

test('preserves object and pointer logical values', () => {
	objectField({
		fields: { label: stringField() },
		hooks: {
			resolveInput: ({ value }) => {
				expectTypeOf(value?.label).toEqualTypeOf<string | null | undefined>()
				return value
			},
		},
	})

	pointerField({
		target: () => Target,
		hooks: {
			resolveInput: ({ value }) => {
				if (value !== null) {
					expectTypeOf(value.schema).toEqualTypeOf<typeof Target>()
				}
				return value
			},
		},
	})
})

test('supports direct handlers, lists, and save-family maps', () => {
	const direct: FieldResolveInputHook<ReturnType<typeof stringField>> = (
		input,
	) => input.value
	const hooks: FieldHooks<ReturnType<typeof stringField>> = {
		resolveInput: {
			all: direct,
			create: ({ value }) => value,
			update: [({ value }) => value],
			upsert: ({ value }) => value,
		},
	}

	expectTypeOf(hooks).toEqualTypeOf<
		FieldHooks<ReturnType<typeof stringField>>
	>()
})

test('rejects removed field lifecycle and validation phases', () => {
	stringField({
		hooks: {
			// @ts-expect-error -- Business validation belongs to schema hooks.
			validate: () => [],
		},
	})
	stringField({
		hooks: {
			// @ts-expect-error -- Mutation lifecycle belongs to schema hooks.
			beforeOperation: () => undefined,
		},
	})
	stringField({
		hooks: {
			// @ts-expect-error -- Mutation lifecycle belongs to schema hooks.
			afterOperation: () => undefined,
		},
	})
})
