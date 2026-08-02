import { expect, expectTypeOf, test } from 'vitest'

import {
	Schema,
	intField,
	stringField,
	type InferCreateInput,
	type InferObject,
	type InferUpdateInput,
	type SchemaHookOperation,
	type SchemaOperationOutcome,
	type SchemaHookResult,
	type SchemaHooks,
	type SchemaHookTypes,
	type SchemaBeforeCommitResult,
} from '../index.js'
import type { Query } from '../../query/index.js'

const ArticleSchema = new Schema({
	className: 'HookedArticle',
	fields: {
		title: stringField({ validation: { required: true } }),
		views: intField(),
	},
	hooks: {
		resolveInput: (input) => {
			if (input.kind === 'create-one') {
				expectTypeOf(input.operation.input.title).toEqualTypeOf<string>()
			}

			if (input.kind === 'update-one') {
				expectTypeOf(
					input.operation.update.kind,
				).toEqualTypeOf<'update-expression'>()
			}

			return input.operation
		},
		validate: ({ operation }) => {
			if (operation.kind === 'create-many') {
				expectTypeOf(operation.inputs).toEqualTypeOf<
					readonly { title: string; views?: number }[]
				>()
			}

			return []
		},
		beforeCreate: ({ operation }) => {
			expectTypeOf(operation.kind).toEqualTypeOf<'create-many' | 'create-one'>()

			return operation
		},
		beforeUpdate: ({ operation }) => {
			expectTypeOf(operation.kind).toEqualTypeOf<'update-many' | 'update-one'>()

			return operation
		},
		beforeUpsert: ({ operation }) => {
			expectTypeOf(operation.kind).toEqualTypeOf<'upsert-many' | 'upsert-one'>()

			return operation
		},
		beforeDelete: ({ operation }) => {
			expectTypeOf(operation.kind).toEqualTypeOf<'delete-many' | 'delete-one'>()

			return operation
		},
		beforeSave: ({ operation }) => {
			expectTypeOf(operation.kind).toEqualTypeOf<
				| 'create-many'
				| 'create-one'
				| 'update-many'
				| 'update-one'
				| 'upsert-many'
				| 'upsert-one'
			>()

			return operation
		},
		beforeFind: (input) => {
			if (input.kind === 'get') {
				expectTypeOf(input.operation.id).toEqualTypeOf<string>()
			}

			return input.query.limit(100)
		},
		afterFind: (input) => {
			if (input.kind === 'count') {
				expectTypeOf(input.result).toEqualTypeOf<number>()
			}

			if (input.kind === 'exists') {
				expectTypeOf(input.result).toEqualTypeOf<boolean>()
			}

			return input.result
		},
		afterOperation: (input) => {
			if (input.kind === 'create-one') {
				expectTypeOf(input.result).toEqualTypeOf<{
					readonly createdAt: string
					readonly id: string
					readonly title: string
					readonly updatedAt: string
					readonly views?: number
				}>()
			}

			return input.result
		},
		beforeCommit: ({ changes }) => {
			expectTypeOf(changes).toExtend<readonly unknown[]>()
		},
		afterCommit: ({ kind, operation }) => {
			expectTypeOf(kind).toEqualTypeOf<typeof operation.kind>()
			expectTypeOf(operation.kind).toEqualTypeOf<
				| 'create-many'
				| 'create-one'
				| 'delete-many'
				| 'delete-one'
				| 'update-many'
				| 'update-one'
				| 'upsert-many'
				| 'upsert-one'
			>()
		},
		afterRollback: ({ error, operations }) => {
			expectTypeOf(error).toBeUnknown()
			expectTypeOf(operations).toExtend<readonly unknown[]>()
		},
		onError: ({ error, kind, operation }) => {
			expectTypeOf(error).toBeUnknown()
			expectTypeOf(kind).toEqualTypeOf<typeof operation.kind>()
			expectTypeOf(operation.kind).toEqualTypeOf<
				SchemaHookOperation<typeof ArticleSchema>['kind']
			>()
		},
	},
})

test('exports compact schema hook inference contracts', () => {
	type Types = SchemaHookTypes<typeof ArticleSchema>
	type CountOperation = SchemaHookOperation<
		typeof ArticleSchema,
		'count',
		never
	>
	type CountTypes = SchemaHookTypes<typeof ArticleSchema, never, CountOperation>
	expect(ArticleSchema.className).toBe('HookedArticle')

	expectTypeOf<Types['create']>().toEqualTypeOf<
		InferCreateInput<typeof ArticleSchema>
	>()
	expectTypeOf<Types['update']>().toEqualTypeOf<
		InferUpdateInput<typeof ArticleSchema>
	>()
	expectTypeOf<Types['object']>().toEqualTypeOf<
		InferObject<typeof ArticleSchema>
	>()
	expectTypeOf<CountTypes['query']>().toEqualTypeOf<
		Query<typeof ArticleSchema>
	>()
	expectTypeOf<CountTypes['result']>().toEqualTypeOf<number>()
	expectTypeOf<
		SchemaHookResult<SchemaHookOperation<typeof ArticleSchema, 'count'>>
	>().toEqualTypeOf<number>()
	expectTypeOf<SchemaHooks<typeof ArticleSchema>>().toBeObject()
})

test('keeps finalization results honest about selected fields', () => {
	type SelectedUpdate = SchemaHookOperation<
		typeof ArticleSchema,
		'update-one',
		'id'
	>
	type SelectedOutcome = SchemaOperationOutcome<SelectedUpdate>

	expectTypeOf<SelectedOutcome['result']>().toEqualTypeOf<{
		readonly id: string
	} | null>()
	expectTypeOf<SchemaBeforeCommitResult<typeof ArticleSchema>>().toEqualTypeOf<
		| Readonly<Partial<InferObject<typeof ArticleSchema>>>
		| readonly Readonly<Partial<InferObject<typeof ArticleSchema>>>[]
		| number
		| null
	>()
})

test('keeps schema metadata and inferred values independent from hooks', () => {
	expectTypeOf<keyof typeof ArticleSchema>().toEqualTypeOf<
		'className' | 'extensions' | 'fields' | 'indexes'
	>()
	expectTypeOf<InferCreateInput<typeof ArticleSchema>>().toEqualTypeOf<{
		title: string
		views?: number
	}>()
	expectTypeOf<InferUpdateInput<typeof ArticleSchema>>().toEqualTypeOf<{
		title?: string
		views?: number
	}>()
})

test('rejects incompatible hook declarations and return values', () => {
	new Schema({
		className: 'InvalidHooks',
		fields: { title: stringField() },
		hooks: {
			// @ts-expect-error -- Unknown phases fail before application startup.
			beforeUnknown: () => undefined,
		},
	})
	new Schema({
		className: 'InvalidHookList',
		fields: { title: stringField() },
		hooks: {
			// @ts-expect-error -- Hook declarations must be functions until issue 327.
			beforeSave: [() => undefined],
		},
	})

	const hooks: SchemaHooks<typeof ArticleSchema> = {
		// @ts-expect-error -- Input resolution cannot replace an operation with a number.
		resolveInput: () => 42,
		// @ts-expect-error -- Query transforms must retain the same selected schema.
		beforeFind: () => 42,
		// @ts-expect-error -- Validation hooks return structured issue collections.
		validate: () => 'invalid',
		// @ts-expect-error -- Result hooks cannot replace public values with symbols.
		afterOperation: () => Symbol('invalid'),
	}
	const effectOnlyHooks: SchemaHooks<typeof ArticleSchema> = {
		beforeDelete: ({ operation }) => {
			// Returning nothing explicitly preserves the immutable operation.
			void operation
		},
	}

	expectTypeOf(hooks).toBeObject()
	expectTypeOf(effectOnlyHooks).toBeObject()
})
