import { expect, expectTypeOf, test } from 'vitest'

import {
	Schema,
	intField,
	pointerField,
	stringField,
	type InferCreateInput,
	type InferObject,
	type InferUpdateInput,
	type HookValidationIssue,
	type HookValidationIssueCode,
	type HookContext,
	type SchemaHookOperation,
	type SchemaHookResult,
	type SchemaHooks,
	type SchemaHookTypes,
	type SchemaBeforeCommitResult,
} from '../index.js'
import type {
	InferQueryRecord,
	NonAtomicBulkResult,
	QueryBuilder,
	QueryPointerResultInclusion,
} from '../../query/index.js'

const ArticleSchema = Schema.define({
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
		beforeOperation: {
			create: ({ context, operation }) => {
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
				expectTypeOf(operation.kind).toEqualTypeOf<
					'create-many' | 'create-one'
				>()

				void operation
			},
			update: ({ operation }) => {
				expectTypeOf(operation.kind).toEqualTypeOf<
					'update-many' | 'update-one'
				>()

				void operation
			},
			upsert: ({ operation }) => {
				expectTypeOf(operation.kind).toEqualTypeOf<
					'upsert-many' | 'upsert-one'
				>()

				void operation
			},
			delete: ({ operation }) => {
				expectTypeOf(operation.kind).toEqualTypeOf<
					'delete-many' | 'delete-one'
				>()

				void operation
			},
		},
		transaction: {
			beforeCommit: ({ changes }) => {
				expectTypeOf(changes).toExtend<readonly unknown[]>()
			},
			afterCommit: ({ changes }) => {
				expectTypeOf(changes).toExtend<readonly unknown[]>()
			},
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
		QueryBuilder<typeof ArticleSchema>
	>()
	expectTypeOf<CountTypes['result']>().toEqualTypeOf<number>()
	expectTypeOf<
		SchemaHookResult<SchemaHookOperation<typeof ArticleSchema, 'count'>>
	>().toEqualTypeOf<number>()
	expectTypeOf<SchemaHooks<typeof ArticleSchema>>().toBeObject()
})

test('keeps finalization results honest about selected fields', () => {
	expectTypeOf<SchemaBeforeCommitResult<typeof ArticleSchema>>().toEqualTypeOf<
		| Readonly<Partial<InferObject<typeof ArticleSchema>>>
		| readonly Readonly<Partial<InferObject<typeof ArticleSchema>>>[]
		| NonAtomicBulkResult<Readonly<Partial<InferObject<typeof ArticleSchema>>>>
		| number
		| null
	>()
})

test('preserves pointer inclusion types through read hook contracts', () => {
	const target = Schema.define({
		className: 'HookIncludedTarget',
		fields: { name: stringField({ validation: { required: true } }) },
	})
	const source = Schema.define({
		className: 'HookIncludedSource',
		fields: {
			target: pointerField({
				target: () => target,
				validation: { required: true },
			}),
		},
	})
	type Inclusion = QueryPointerResultInclusion<'target', typeof target, 'name'>
	type IncludedFind = SchemaHookOperation<
		typeof source,
		'find-many',
		'target',
		Inclusion
	>
	type IncludedTypes = SchemaHookTypes<typeof source, 'target', IncludedFind>
	expectTypeOf(source.className).toEqualTypeOf<'HookIncludedSource'>()

	expectTypeOf<SchemaHookResult<IncludedFind>>().toEqualTypeOf<
		readonly InferQueryRecord<typeof source, 'target', Inclusion>[]
	>()
	expectTypeOf<IncludedTypes['query']>().toEqualTypeOf<
		QueryBuilder<typeof source, 'target', Inclusion>
	>()
})

test('namespaces application-owned hook validation issues', () => {
	const issue: HookValidationIssue = {
		code: 'hook.article-title',
		message: 'The title is invalid.',
		path: ['title'],
	}

	expectTypeOf(issue.code).toEqualTypeOf<HookValidationIssueCode>()
	expectTypeOf<'hook.article-title'>().toExtend<HookValidationIssueCode>()
	expectTypeOf<'custom'>().not.toExtend<HookValidationIssueCode>()
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
				({ operation }) => void operation,
				({ operation }) => {
					expectTypeOf(operation.kind).toEqualTypeOf<
						'create-many' | 'create-one'
					>()

					void operation
				},
			],
		},
		resolveInput: {
			all: ({ operation }) => operation,
			create: [
				({ operation }) => {
					expectTypeOf(operation.kind).toEqualTypeOf<
						'create-many' | 'create-one'
					>()

					return operation
				},
			],
			update: ({ operation }) => {
				expectTypeOf(operation.kind).toEqualTypeOf<
					'update-many' | 'update-one'
				>()

				return operation
			},
		},
		transaction: {
			afterCommit: ({ changes }) => {
				expectTypeOf(changes).toExtend<readonly unknown[]>()
			},
		},
	}

	expectTypeOf(hooks).toEqualTypeOf<SchemaHooks<typeof ArticleSchema>>()
})

test('narrows complete mutation items by terminal and lifecycle timing', () => {
	const hooks: SchemaHooks<typeof ArticleSchema> = {
		beforeOperation: {
			create: (input) => {
				if (input.kind === 'create-one') {
					expectTypeOf(input.originalItem).toEqualTypeOf<null>()
					expectTypeOf(input.item).toEqualTypeOf<
						Readonly<InferObject<typeof ArticleSchema>>
					>()
				} else {
					expectTypeOf(input.items[0]?.originalItem).toEqualTypeOf<
						null | undefined
					>()
				}
			},
			update: (input) => {
				if (input.kind === 'update-one') {
					expectTypeOf(input.originalItem).toEqualTypeOf<
						Readonly<InferObject<typeof ArticleSchema>>
					>()
					expectTypeOf(input.item).toEqualTypeOf<
						Readonly<InferObject<typeof ArticleSchema>>
					>()
				} else {
					// Set-based writes do not materialize matching rows before execution.
					// @ts-expect-error -- updateMany has no prepared item collection.
					void input.items
				}
			},
			delete: (input) => {
				if (input.kind === 'delete-one') {
					expectTypeOf(input.originalItem).toEqualTypeOf<
						Readonly<InferObject<typeof ArticleSchema>>
					>()
					expectTypeOf(input.item).toEqualTypeOf<null>()
				}
			},
			upsert: (input) => {
				// Atomic upsert branch selection happens inside the database statement.
				// @ts-expect-error -- no reliable preimage exists before an upsert.
				void input.originalItem
			},
		},
		afterOperation: {
			upsert: (input) => {
				if (input.kind === 'upsert-one') {
					expectTypeOf(input.originalItem).toEqualTypeOf<Readonly<
						InferObject<typeof ArticleSchema>
					> | null>()
					expectTypeOf(input.item).toEqualTypeOf<
						Readonly<InferObject<typeof ArticleSchema>>
					>()
				} else {
					expectTypeOf(input.items).toExtend<readonly unknown[]>()
				}
			},
		},
	}

	expectTypeOf(hooks).toEqualTypeOf<SchemaHooks<typeof ArticleSchema>>()
})

test('rejects incompatible hook declarations and return values', () => {
	Schema.define({
		className: 'InvalidHooks',
		fields: { title: stringField() },
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

	expectTypeOf(hooks).toBeObject()
	expectTypeOf(effectOnlyHooks).toBeObject()
	expectTypeOf(invalidFamilyHooks).toBeObject()
	expectTypeOf(invalidEmptyList).toBeObject()
	expectTypeOf(invalidEmptyFamily).toBeObject()
	expectTypeOf(invalidFamilyReturn).toBeObject()
})
