import { expectTypeOf, test } from 'vitest'

import {
	definePluginField,
	enumField,
	intField,
	objectField,
	Schema,
	stringField,
	type FieldBeforeDeleteHook,
	type FieldBeforeSaveHook,
	type FieldBeforeUpdateHook,
	type FieldChangeHookInput,
	type FieldErrorHook,
	type FieldHookTypes,
	type FieldHooks,
	type FieldInputHookInput,
	type FieldOnChangeHook,
	type FieldValueChange,
	type FieldValueState,
	type HookErrorPhase,
	type HookErrorTransactionState,
	type HookContext,
	type InferCreateInput,
	type InferObject,
	type InferUpdateInput,
} from '../index.js'

const titleField = stringField({
	hooks: {
		resolveInput: ({ context, value }) => {
			expectTypeOf(context).toEqualTypeOf<HookContext>()
			// @ts-expect-error -- Field hooks cannot inspect request credentials.
			void context.metadata
			// @ts-expect-error -- Field hooks cannot mutate transaction state.
			void context.rollback

			return value.trim()
		},
		resolveOutput: ({ value }) => value,
	},
})

const statusField = enumField({
	values: ['draft', 'published'],
	hooks: {
		resolveInput: ({ value }) => value,
	},
})

const nullableField = stringField({
	validation: { nullable: true },
	hooks: {
		resolveInput: ({ value }) => value,
	},
})

const matrixField = intField({
	list: [true, true],
	hooks: {
		resolveInput: ({ value }) => value,
	},
})

const immutableField = stringField({
	immutable: true,
	hooks: {
		beforeCreate: ({ value }) => {
			value.toUpperCase()
		},
	},
})

const profileField = objectField({
	fields: {
		displayName: stringField({ validation: { required: true } }),
		biography: stringField(),
		visits: intField({ default: 0 }),
	},
	hooks: {
		resolveInput: (input) => input.value,
		resolveOutput: ({ value }) => value,
	},
})

const vectorNormalizers = {
	snapshotValue: (value: unknown): readonly number[] => {
		// The declaration test only needs a precise plugin-owned logical value.
		void value
		return []
	},
}

const vectorField = definePluginField(
	'fixture.vector',
	{
		hooks: {
			resolveInput: ({ value }) => value,
			resolveOutput: ({ value }) => value,
		},
	},
	vectorNormalizers,
)

const HookedSchema = new Schema({
	className: 'HookedFieldInference',
	fields: {
		title: stringField({
			validation: { required: true },
			hooks: { resolveInput: ({ value }) => value.trim() },
		}),
	},
})

const PlainSchema = new Schema({
	className: 'PlainFieldInference',
	fields: {
		title: stringField({ validation: { required: true } }),
	},
})

// Runtime declarations are retained only to exercise their inferred compile-time types.
void [
	titleField,
	statusField,
	nullableField,
	matrixField,
	immutableField,
	profileField,
	vectorField,
	HookedSchema,
	PlainSchema,
]

test('infers exact scalar, enum, nullable, and listed hook values', () => {
	expectTypeOf<FieldHookTypes<typeof titleField>>().toEqualTypeOf<{
		readonly create: string
		readonly object: string
		readonly update: string
	}>()
	expectTypeOf<FieldHookTypes<typeof statusField>>().toEqualTypeOf<{
		readonly create: 'draft' | 'published'
		readonly object: 'draft' | 'published'
		readonly update: 'draft' | 'published'
	}>()
	expectTypeOf<FieldHookTypes<typeof nullableField>>().toEqualTypeOf<{
		readonly create: string | null
		readonly object: string | null
		readonly update: string | null
	}>()
	expectTypeOf<FieldHookTypes<typeof matrixField>>().toEqualTypeOf<{
		readonly create: readonly (readonly number[])[]
		readonly object: readonly (readonly number[])[]
		readonly update: readonly (readonly number[])[]
	}>()
})

test('keeps object create, update, and persisted values distinct', () => {
	type ProfileHooks = FieldHookTypes<typeof profileField>

	expectTypeOf<ProfileHooks['create']>().toEqualTypeOf<{
		displayName: string
		biography?: string
		visits?: number
	}>()
	expectTypeOf<ProfileHooks['update']>().toEqualTypeOf<{
		displayName?: string
		biography?: string
		visits?: number
	}>()
	expectTypeOf<ProfileHooks['object']>().toEqualTypeOf<{
		readonly displayName: string
		readonly biography?: string
		readonly visits: number
	}>()
})

test('removes impossible immutable updates without changing other modes', () => {
	type ImmutableHooks = FieldHookTypes<typeof immutableField>

	expectTypeOf<ImmutableHooks['create']>().toEqualTypeOf<string>()
	expectTypeOf<ImmutableHooks['object']>().toEqualTypeOf<string>()
	expectTypeOf<ImmutableHooks['update']>().toBeNever()
	expectTypeOf<
		Extract<
			FieldInputHookInput<typeof immutableField>,
			{
				readonly mode: 'update'
			}
		>
	>().toBeNever()
})

test('preserves a plugin field logical value without retaining hook metadata', () => {
	expectTypeOf<FieldHookTypes<typeof vectorField>>().toEqualTypeOf<{
		readonly create: readonly number[]
		readonly object: readonly number[]
		readonly update: readonly number[]
	}>()
	expectTypeOf<'hooks'>().not.toExtend<keyof typeof vectorField.options>()
})

test('keeps hook declarations out of field metadata and schema inference', () => {
	expectTypeOf<'hooks'>().not.toExtend<keyof typeof titleField.options>()
	expectTypeOf<InferCreateInput<typeof HookedSchema>>().toEqualTypeOf<
		InferCreateInput<typeof PlainSchema>
	>()
	expectTypeOf<InferUpdateInput<typeof HookedSchema>>().toEqualTypeOf<
		InferUpdateInput<typeof PlainSchema>
	>()
	expectTypeOf<InferObject<typeof HookedSchema>>().toEqualTypeOf<
		InferObject<typeof PlainSchema>
	>()
})

test('narrows present values and excludes absent-to-absent changes', () => {
	const inspectState = (state: FieldValueState<string | null>): void => {
		if (state.present) {
			expectTypeOf(state.value).toEqualTypeOf<string | null>()
			return
		}

		expectTypeOf(state).toEqualTypeOf<Readonly<{ present: false }>>()
	}

	type AbsentToAbsent = Readonly<{
		previous: Readonly<{ present: false }>
		current: Readonly<{ present: false }>
	}>

	// Keeping the narrowing function unused avoids fabricating a runtime field state.
	void inspectState
	expectTypeOf<AbsentToAbsent>().not.toExtend<FieldValueChange<string>>()
	expectTypeOf<{
		readonly previous: { readonly present: false }
		readonly current: { readonly present: true; readonly value: string }
	}>().toExtend<FieldValueChange<string>>()
})

test('keeps set-based terminals out of materialized field hooks', () => {
	type InputKind = FieldInputHookInput<typeof titleField>['kind']
	type BeforeUpdateKind = Parameters<
		FieldBeforeUpdateHook<typeof titleField>
	>[0]['kind']
	type BeforeDeleteKind = Parameters<
		FieldBeforeDeleteHook<typeof titleField>
	>[0]['kind']
	type BeforeSaveKind = Parameters<
		FieldBeforeSaveHook<typeof titleField>
	>[0]['kind']
	type ChangeKind = FieldChangeHookInput<typeof titleField>['kind']
	type OnChangeKind = Parameters<
		FieldOnChangeHook<typeof titleField>
	>[0]['kind']
	type ErrorKind = Parameters<FieldErrorHook>[0]['kind']

	// Input transforms may normalize one supplied update expression without loading rows.
	expectTypeOf<'update-many'>().toExtend<InputKind>()
	expectTypeOf<'update-many'>().not.toExtend<BeforeUpdateKind>()
	expectTypeOf<'update-many'>().not.toExtend<BeforeSaveKind>()
	expectTypeOf<'update-many'>().not.toExtend<ChangeKind>()
	expectTypeOf<'update-many'>().not.toExtend<OnChangeKind>()
	expectTypeOf<'delete-many'>().not.toExtend<BeforeDeleteKind>()
	expectTypeOf<'delete-many'>().not.toExtend<ChangeKind>()
	// Output failures remain observable for materialized read terminals.
	expectTypeOf<'find'>().toExtend<ErrorKind>()
	expectTypeOf<'first'>().toExtend<ErrorKind>()
	expectTypeOf<'get'>().toExtend<ErrorKind>()
})

test('exposes precise error lifecycle metadata to field hooks', () => {
	const observeError: FieldErrorHook = ({ phase, transaction }) => {
		expectTypeOf(phase).toEqualTypeOf<HookErrorPhase>()
		expectTypeOf(transaction).toEqualTypeOf<HookErrorTransactionState>()

		if (transaction.status === 'rollback-failed') {
			expectTypeOf(transaction.rollback).toEqualTypeOf<'failed'>()
		}
	}

	expectTypeOf(observeError).toEqualTypeOf<FieldErrorHook>()
})

test('types ordered field handler lists and compatible family maps', () => {
	const hooks: FieldHooks<typeof titleField> = {
		beforeCreate: [
			({ value }) => {
				expectTypeOf(value).toEqualTypeOf<string>()
			},
			({ kind }) => {
				expectTypeOf(kind).toEqualTypeOf<'create-many' | 'create-one'>()
			},
		],
		resolveInput: {
			all: ({ value }) => value,
			update: ({ kind, value }) => {
				expectTypeOf(kind).toEqualTypeOf<'update-many' | 'update-one'>()

				return value.trim()
			},
		},
		beforeSave: {
			all: ({ value }) => {
				expectTypeOf(value).toEqualTypeOf<string>()
			},
			upsert: ({ kind, mode }) => {
				expectTypeOf(kind).toEqualTypeOf<'upsert-many' | 'upsert-one'>()
				expectTypeOf(mode).toEqualTypeOf<'create' | 'update'>()
			},
		},
		resolveOutput: {
			all: ({ value }) => value,
			find: ({ kind, value }) => {
				expectTypeOf(kind).toEqualTypeOf<'find' | 'first' | 'get'>()

				return value
			},
		},
	}

	expectTypeOf(hooks).toEqualTypeOf<FieldHooks<typeof titleField>>()
})

test('rejects invalid field families, empty lists, and incompatible returns', () => {
	const invalidFamilyHooks: FieldHooks<typeof titleField> = {
		// @ts-expect-error -- Save families never accept read-specific handlers.
		beforeSave: { find: () => undefined },
	}
	const invalidEmptyList: FieldHooks<typeof titleField> = {
		// @ts-expect-error -- Ordered hook lists must contain at least one handler.
		beforeCreate: [],
	}
	const invalidEmptyFamily: FieldHooks<typeof titleField> = {
		// @ts-expect-error -- Family maps must declare at least one branch.
		beforeSave: {},
	}
	const invalidReturn: FieldHooks<typeof titleField> = {
		// @ts-expect-error -- Input transforms preserve the field's logical type.
		resolveInput: {
			create: () => 42,
		},
	}

	expectTypeOf(invalidFamilyHooks).toBeObject()
	expectTypeOf(invalidEmptyList).toBeObject()
	expectTypeOf(invalidEmptyFamily).toBeObject()
	expectTypeOf(invalidReturn).toBeObject()
})
