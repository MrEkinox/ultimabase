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
	type HookErrorPhase,
	type HookErrorTransactionState,
	type HookContext,
	type SchemaHookOperation,
	type SchemaOperationOutcome,
	type SchemaHookResult,
	type SchemaHooks,
	type SchemaHookTypes,
	type SchemaBeforeCommitResult,
} from '../index.js'
import type {
	InferQueryRecord,
	NonAtomicBulkResult,
	Query,
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
		validate: ({ operation }) => {
			if (operation.kind === 'create-many') {
				expectTypeOf(operation.inputs).toEqualTypeOf<
					readonly { title: string; views?: number | null }[]
				>()
			}

			return []
		},
		beforeCreate: ({ context, operation }) => {
			expectTypeOf(context).toEqualTypeOf<HookContext>()
			expectTypeOf(context.requestId).toBeString()
			expectTypeOf(context.transactionId).toEqualTypeOf<string | undefined>()
			expectTypeOf(context.signal).toEqualTypeOf<AbortSignal>()
			expectTypeOf(context.access.mode).toEqualTypeOf<'anonymous' | 'master'>()
			// @ts-expect-error -- Hook execution identity never exposes private metadata.
			void context.metadata
			// @ts-expect-error -- Hooks cannot own transaction finalization.
			void context.commit
			// @ts-expect-error -- Business invariants cannot be bypassed.
			void context.skipHooks
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
		beforeRead: (input) => {
			if (input.kind === 'get') {
				expectTypeOf(input.operation.id).toEqualTypeOf<string>()
			}

			return input.query.limit(100)
		},
		afterRead: (input) => {
			if (input.kind === 'count') {
				expectTypeOf(input.result).toEqualTypeOf<number>()
			}

			if (input.kind === 'exists') {
				expectTypeOf(input.result).toEqualTypeOf<boolean>()
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
		onError: ({ error, kind, operation, phase, transaction }) => {
			expectTypeOf(error).toBeUnknown()
			expectTypeOf(kind).toEqualTypeOf<typeof operation.kind>()
			expectTypeOf(operation.kind).toEqualTypeOf<
				SchemaHookOperation<typeof ArticleSchema>['kind']
			>()
			expectTypeOf(phase).toEqualTypeOf<HookErrorPhase>()
			expectTypeOf(transaction).toEqualTypeOf<HookErrorTransactionState>()

			if (transaction.status === 'rolled-back') {
				expectTypeOf(transaction.rollback).toEqualTypeOf<'succeeded'>()
			}
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

test('keeps error transaction outcomes internally consistent', () => {
	expectTypeOf<HookErrorTransactionState>().toEqualTypeOf<
		| Readonly<{
				status: 'not-started'
				rollback: 'not-applicable'
		  }>
		| Readonly<{ status: 'rolled-back'; rollback: 'succeeded' }>
		| Readonly<{ status: 'rollback-failed'; rollback: 'failed' }>
		| Readonly<{ status: 'committed'; rollback: 'not-applicable' }>
	>()
	expectTypeOf<HookErrorPhase>().toEqualTypeOf<
		| 'transaction-start'
		| 'operation'
		| 'before-commit'
		| 'commit'
		| 'rollback'
		| 'after-rollback'
		| 'after-commit'
		| 'post-commit'
	>()
	expectTypeOf<{
		status: 'committed'
		rollback: 'succeeded'
	}>().not.toExtend<HookErrorTransactionState>()
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
		Query<typeof source, 'target', Inclusion>
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
		| 'createOne'
		| 'createMany'
		| 'deleteMany'
		| 'deleteOne'
		| 'definition'
		| 'extensions'
		| 'fields'
		| 'indexes'
		| 'pointer'
		| 'query'
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
		beforeCreate: [
			({ operation }) => operation,
			({ operation }) => {
				expectTypeOf(operation.kind).toEqualTypeOf<
					'create-many' | 'create-one'
				>()

				return operation
			},
		],
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
		afterCommit: {
			upsert: ({ kind }) => {
				expectTypeOf(kind).toEqualTypeOf<'upsert-many' | 'upsert-one'>()
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
		// @ts-expect-error -- Query transforms must retain the same selected schema.
		beforeRead: () => 42,
		// @ts-expect-error -- Validation hooks return structured issue collections.
		validate: () => 'invalid',
		// @ts-expect-error -- Result hooks cannot replace public values with symbols.
		afterCreate: () => Symbol('invalid'),
	}
	const effectOnlyHooks: SchemaHooks<typeof ArticleSchema> = {
		beforeDelete: ({ operation }) => {
			// Returning nothing explicitly preserves the immutable operation.
			void operation
		},
	}
	const invalidFamilyHooks: SchemaHooks<typeof ArticleSchema> = {
		// @ts-expect-error -- Input resolution accepts only save-family branches.
		resolveInput: { read: () => undefined },
	}
	const invalidEmptyList: SchemaHooks<typeof ArticleSchema> = {
		// @ts-expect-error -- Ordered hook lists must contain at least one handler.
		beforeCreate: [],
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
