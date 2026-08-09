import { expect, expectTypeOf, test } from 'vitest'

import {
	Schema,
	type BaseItem,
	type InferCreateInput,
	type InferObject,
	type InferUpdateInput,
	type HookContext,
	type SchemaHooks,
	type SchemaPreparedDraft,
	type SchemaResult,
} from '../index.js'

const ArticleSchema = Schema.define({
	className: 'HookedArticle',
	fields: (field) => ({
		title: field.string({ validation: { required: true } }),
		views: field.int(),
	}),
	hooks: {
		resolveInput: (input) => {
			if (input.kind === 'create') {
				expectTypeOf(input.originalItem).toEqualTypeOf<null>()
				expectTypeOf(input.operation.input.title).toEqualTypeOf<string>()
			}

			if (input.kind === 'update') {
				expectTypeOf(input.originalItem).toExtend<BaseItem>()
				expectTypeOf(
					input.operation.update.kind,
				).toEqualTypeOf<'update-expression'>()
			}

			return input.operation
		},
		beforeOperation: {
			create: ({ context, item, kind }) => {
				expectTypeOf(context).toEqualTypeOf<HookContext>()
				expectTypeOf(context.requestId).toBeString()
				expectTypeOf(context.transactionId).toEqualTypeOf<string | undefined>()
				expectTypeOf(context.signal).toEqualTypeOf<AbortSignal>()
				expectTypeOf(context.access.mode).toEqualTypeOf<
					'anonymous' | 'master'
				>()
				// @ts-expect-error -- Hook execution identity never exposes private metadata.
				void context.metadata
				// @ts-expect-error -- Hooks cannot own transaction finalization.
				void context.commit
				// @ts-expect-error -- Business invariants cannot be bypassed.
				void context.skipHooks
				expectTypeOf(kind).toEqualTypeOf<'create'>()
				expectTypeOf(item).toExtend<BaseItem>()

				void item
			},
			update: ({ kind, operation }) => {
				expectTypeOf(kind).toEqualTypeOf<'update'>()
				expectTypeOf(operation.kind).toEqualTypeOf<'update-one'>()

				void operation
			},
			delete: ({ kind, operation }) => {
				expectTypeOf(kind).toEqualTypeOf<'delete'>()
				expectTypeOf(operation.kind).toEqualTypeOf<'delete-one'>()

				void operation
			},
		},
	},
})

test('exports the focused schema hook declaration contract', () => {
	expect(ArticleSchema.className).toBe('HookedArticle')
	expectTypeOf<SchemaHooks<typeof ArticleSchema>>().toBeObject()
})

test('keeps schema metadata and inferred values independent from hooks', () => {
	expectTypeOf<keyof typeof ArticleSchema>().toEqualTypeOf<
		| 'className'
		| 'count'
		| 'createOne'
		| 'createMany'
		| 'deleteMany'
		| 'deleteOne'
		| 'definition'
		| 'extensions'
		| 'exists'
		| 'fields'
		| 'findMany'
		| 'findOne'
		| 'get'
		| 'indexes'
		| 'pointer'
		| 'updateMany'
		| 'updateOne'
		| 'upsertOne'
		| 'upsertMany'
	>()
	expectTypeOf<InferCreateInput<typeof ArticleSchema>>().toEqualTypeOf<{
		title: string
		views?: number | null
	}>()
	expectTypeOf<InferUpdateInput<typeof ArticleSchema>>().toEqualTypeOf<{
		title?: string
		views?: number | null
	}>()
})

test('types ordered exact handlers and the remaining lifecycle families', () => {
	const hooks: SchemaHooks<typeof ArticleSchema> = {
		beforeOperation: {
			create: [
				({ item }) => void item,
				({ kind }) => {
					expectTypeOf(kind).toEqualTypeOf<'create'>()

					void kind
				},
			],
		},
		resolveInput: {
			all: ({ operation }) => operation,
			create: [
				({ operation, originalItem }) => {
					expectTypeOf(operation.kind).toEqualTypeOf<'create-one'>()
					expectTypeOf(originalItem).toEqualTypeOf<null>()

					return operation
				},
			],
			update: ({ operation, originalItem }) => {
				expectTypeOf(operation.kind).toEqualTypeOf<'update-one'>()
				expectTypeOf(originalItem).toEqualTypeOf<
					SchemaResult<typeof ArticleSchema>
				>()

				return operation
			},
		},
	}

	expectTypeOf(hooks).toEqualTypeOf<SchemaHooks<typeof ArticleSchema>>()
})

test('narrows complete mutation items by terminal and lifecycle timing', () => {
	const hooks: SchemaHooks<typeof ArticleSchema> = {
		beforeOperation: {
			create: (input) => {
				expectTypeOf(input.kind).toEqualTypeOf<'create'>()
				expectTypeOf(input.item).toEqualTypeOf<
					SchemaPreparedDraft<typeof ArticleSchema>
				>()
				// @ts-expect-error -- Create observers do not expose a constant preimage.
				void input.originalItem
				// @ts-expect-error -- Create observers do not expose the internal terminal AST.
				void input.operation
			},
			update: (input) => {
				expectTypeOf(input.kind).toEqualTypeOf<'update'>()
				expectTypeOf(input.originalItem).toEqualTypeOf<
					SchemaResult<typeof ArticleSchema>
				>()
				expectTypeOf(input.item).toEqualTypeOf<
					Readonly<InferObject<typeof ArticleSchema>>
				>()
			},
			delete: (input) => {
				expectTypeOf(input.kind).toEqualTypeOf<'delete'>()
				expectTypeOf(input.originalItem).toEqualTypeOf<
					SchemaResult<typeof ArticleSchema>
				>()
				expectTypeOf(input.item).toEqualTypeOf<null>()
			},
		},
		afterOperation: {
			create: (input) => {
				expectTypeOf(input.item).toEqualTypeOf<
					SchemaResult<typeof ArticleSchema>
				>()
				// @ts-expect-error -- Public result projections are not hook inputs.
				void input.result
			},
			upsert: (input) => {
				expectTypeOf(input.kind).toEqualTypeOf<'upsert'>()
				expectTypeOf(input.originalItem).toEqualTypeOf<SchemaResult<
					typeof ArticleSchema
				> | null>()
				expectTypeOf(input.item).toEqualTypeOf<
					SchemaResult<typeof ArticleSchema>
				>()
			},
		},
	}

	expectTypeOf(hooks).toEqualTypeOf<SchemaHooks<typeof ArticleSchema>>()
})

test('rejects incompatible hook declarations and return values', () => {
	Schema.define({
		className: 'InvalidHooks',
		fields: (field) => ({ title: field.string() }),
		hooks: {
			// @ts-expect-error -- Unknown phases fail before application startup.
			beforeUnknown: () => undefined,
		},
	})
	const hooks: SchemaHooks<typeof ArticleSchema> = {
		// @ts-expect-error -- Input resolution cannot replace an operation with a number.
		resolveInput: () => 42,
	}
	const effectOnlyHooks: SchemaHooks<typeof ArticleSchema> = {
		beforeOperation: {
			delete: ({ operation }) => {
				// Returning nothing explicitly preserves the immutable operation.
				void operation
			},
		},
	}
	const invalidFamilyHooks: SchemaHooks<typeof ArticleSchema> = {
		// @ts-expect-error -- Input resolution accepts only save-family branches.
		resolveInput: { read: () => undefined },
	}
	const invalidEmptyList: SchemaHooks<typeof ArticleSchema> = {
		beforeOperation: {
			// @ts-expect-error -- Ordered hook lists must contain at least one handler.
			create: [],
		},
	}
	const invalidBeforeUpsert: SchemaHooks<typeof ArticleSchema> = {
		beforeOperation: {
			// @ts-expect-error -- Atomic upserts expose their branch only after persistence.
			upsert: () => undefined,
		},
	}
	const invalidEmptyFamily: SchemaHooks<typeof ArticleSchema> = {
		// @ts-expect-error -- Family maps must declare at least one branch.
		resolveInput: {},
	}
	const invalidFamilyReturn: SchemaHooks<typeof ArticleSchema> = {
		// @ts-expect-error -- A create transform must retain its operation family.
		resolveInput: {
			create: () => 42,
		},
	}
	const invalidTransactionHooks: SchemaHooks<typeof ArticleSchema> = {
		// @ts-expect-error -- Commit observers use typed context events instead.
		transaction: { afterCommit: () => undefined },
	}

	expectTypeOf(hooks).toBeObject()
	expectTypeOf(effectOnlyHooks).toBeObject()
	expectTypeOf(invalidFamilyHooks).toBeObject()
	expectTypeOf(invalidEmptyList).toBeObject()
	expectTypeOf(invalidBeforeUpsert).toBeObject()
	expectTypeOf(invalidEmptyFamily).toBeObject()
	expectTypeOf(invalidFamilyReturn).toBeObject()
	expectTypeOf(invalidTransactionHooks).toBeObject()
})
