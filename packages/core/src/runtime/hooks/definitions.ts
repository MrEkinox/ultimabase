import type {
	ExecutableOperationAst,
	OperationKind,
	UpdateOneOperationAst,
} from '../../query/index.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'

import type { HookContext } from '../../schema/hooks/hook-context.js'
import type {
	DatabaseMutationLogicalRecord,
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationResult,
} from '../database/contracts.js'
/** Supplies low-level hooks with safe execution identity and one operation. */
export interface RuntimeHookOperationInput<
	TOperation extends DatabaseOperationAst,
> {
	/** Exposes immutable request identity and revocable hook capabilities. */
	readonly context: HookContext
	/** Contains the immutable operation observed by the low-level hook. */
	readonly operation: TOperation
}

/** Supplies low-level after hooks without exposing request authority. */
export interface RuntimeHookResultInput<
	TOperation extends DatabaseOperationAst,
> extends RuntimeHookOperationInput<TOperation> {
	/** Contains the immutable adapter result paired with the observed operation. */
	readonly result: DatabaseOperationResult<TOperation>
}

/** Supplies one stable singular preimage after Access has authorized its row. */
export interface RuntimePreparedOperationInput<
	TOperation extends DatabaseMutationOperationAst,
> extends RuntimeHookOperationInput<TOperation> {
	/** Contains the locked logical object that the mutation would update. */
	readonly target: DatabaseMutationLogicalRecord<TOperation>
}

const runtimeOperationKinds = new Set<OperationKind>([
	'find',
	'first',
	'get',
	'count',
	'exists',
	'create-one',
	'create-many',
	'update-one',
	'update-many',
	'upsert-one',
	'upsert-many',
	'delete-one',
	'delete-many',
])

type RuntimeHookOperation<
	TSchema extends SchemaDefinition,
	TOperationKind extends OperationKind,
> = Extract<ExecutableOperationAst<TSchema>, { readonly kind: TOperationKind }>

/** Makes every before-hook transformation explicit rather than relying on mutation. */
export interface BeforeOperationResult<
	TOperation extends DatabaseOperationAst,
> {
	readonly operation: TOperation
}

/** Makes every after-hook transformation explicit rather than relying on mutation. */
export interface AfterOperationResult<TOperation extends DatabaseOperationAst> {
	readonly result: DatabaseOperationResult<TOperation>
}

export type BeforeOperationHandler<
	TSchema extends SchemaDefinition,
	TOperationKind extends OperationKind,
> = (
	input: RuntimeHookOperationInput<
		RuntimeHookOperation<TSchema, TOperationKind>
	>,
) => MaybePromise<
	BeforeOperationResult<RuntimeHookOperation<TSchema, TOperationKind>>
>

export type AfterOperationHandler<
	TSchema extends SchemaDefinition,
	TOperationKind extends OperationKind,
> = (
	input: RuntimeHookResultInput<RuntimeHookOperation<TSchema, TOperationKind>>,
) => MaybePromise<
	AfterOperationResult<RuntimeHookOperation<TSchema, TOperationKind>>
>

export type PostCommitEventHandler<
	TSchema extends SchemaDefinition,
	TOperationKind extends OperationKind,
> = (
	input: RuntimeHookResultInput<RuntimeHookOperation<TSchema, TOperationKind>>,
) => MaybePromise<void>

/** Resolves one authorized update value against its locked current object. */
export type PreparedOperationHandler<TSchema extends SchemaDefinition> = (
	input: RuntimePreparedOperationInput<UpdateOneOperationAst<TSchema>>,
) => MaybePromise<BeforeOperationResult<UpdateOneOperationAst<TSchema>>>

interface RuntimeContributionOptions<
	TSchema extends SchemaDefinition,
	TOperations extends readonly OperationKind[],
	THandler,
> {
	/** Omitting schema declares a global contribution. */
	readonly schema?: TSchema
	/** Omitting operations subscribes to every terminal kind. */
	readonly operations?: TOperations
	readonly handler: THandler
}

export type BeforeOperationOptions<
	TSchema extends SchemaDefinition,
	TOperations extends readonly OperationKind[],
> = RuntimeContributionOptions<
	TSchema,
	TOperations,
	BeforeOperationHandler<TSchema, TOperations[number]>
>

export type AfterOperationOptions<
	TSchema extends SchemaDefinition,
	TOperations extends readonly OperationKind[],
> = RuntimeContributionOptions<
	TSchema,
	TOperations,
	AfterOperationHandler<TSchema, TOperations[number]>
>

export type PostCommitEventOptions<
	TSchema extends SchemaDefinition,
	TOperations extends readonly OperationKind[],
> = RuntimeContributionOptions<
	TSchema,
	TOperations,
	PostCommitEventHandler<TSchema, TOperations[number]>
>

export type PreparedOperationOptions<TSchema extends SchemaDefinition> = Omit<
	RuntimeContributionOptions<
		TSchema,
		readonly ['update-one'],
		PreparedOperationHandler<TSchema>
	>,
	'operations'
>

declare const runtimeContributionType: unique symbol

interface RuntimeContributionDefinition<
	TKind extends RuntimeContributionKind,
	TSchema extends SchemaDefinition,
	TOperationKind extends OperationKind,
	THandler,
> {
	readonly kind: TKind
	readonly schema: TSchema | undefined
	readonly operations: readonly TOperationKind[] | undefined
	// The phantom handler retains contextual inference without exposing mutable execution state.
	readonly [runtimeContributionType]?: THandler
}

export type BeforeOperationDefinition<
	TSchema extends SchemaDefinition = SchemaDefinition,
	TOperationKind extends OperationKind = OperationKind,
> = RuntimeContributionDefinition<
	'before-operation',
	TSchema,
	TOperationKind,
	BeforeOperationHandler<TSchema, TOperationKind>
>

export type AfterOperationDefinition<
	TSchema extends SchemaDefinition = SchemaDefinition,
	TOperationKind extends OperationKind = OperationKind,
> = RuntimeContributionDefinition<
	'after-operation',
	TSchema,
	TOperationKind,
	AfterOperationHandler<TSchema, TOperationKind>
>

export type PostCommitEventDefinition<
	TSchema extends SchemaDefinition = SchemaDefinition,
	TOperationKind extends OperationKind = OperationKind,
> = RuntimeContributionDefinition<
	'post-commit-event',
	TSchema,
	TOperationKind,
	PostCommitEventHandler<TSchema, TOperationKind>
>

export type PreparedOperationDefinition<
	TSchema extends SchemaDefinition = SchemaDefinition,
> = RuntimeContributionDefinition<
	'prepared-operation',
	TSchema,
	'update-one',
	PreparedOperationHandler<TSchema>
>

export type RuntimeContributionDefinitionUnion =
	| BeforeOperationDefinition
	| AfterOperationDefinition
	| PreparedOperationDefinition
	| PostCommitEventDefinition

type RuntimeContributionKind =
	| 'after-operation'
	| 'before-operation'
	| 'post-commit-event'
	| 'prepared-operation'

interface RuntimeContributionImplementation {
	readonly kind: RuntimeContributionKind
	readonly schema: SchemaDefinition | undefined
	readonly operations: readonly OperationKind[] | undefined
	run(input: RuntimeContributionInput): MaybePromise<unknown>
}

type RuntimeContributionInput =
	| RuntimeHookOperationInput<DatabaseOperationAst>
	| RuntimePreparedOperationInput<DatabaseMutationOperationAst>
	| RuntimeHookResultInput<DatabaseOperationAst>

type ErasedRuntimeContributionHandler = (
	input: RuntimeContributionInput,
) => MaybePromise<unknown>

const runtimeContributionImplementations = new WeakMap<
	object,
	RuntimeContributionImplementation
>()

const contributionOptionKeys = new Set(['handler', 'operations', 'schema'])

const normalizeOperations = (
	operations: readonly OperationKind[] | undefined,
): readonly OperationKind[] | undefined => {
	if (operations === undefined) {
		return undefined
	}

	const untrustedOperations: unknown = operations

	if (
		!isUnknownArray(untrustedOperations) ||
		untrustedOperations.length === 0
	) {
		throw new TypeError(
			'runtime contribution operations must be a non-empty array',
		)
	}

	const normalizedOperations: OperationKind[] = []

	for (const operation of untrustedOperations) {
		if (
			typeof operation !== 'string' ||
			!runtimeOperationKinds.has(operation as OperationKind)
		) {
			throw new TypeError(
				`Unknown runtime operation kind: ${String(operation)}`,
			)
		}

		if (!normalizedOperations.includes(operation as OperationKind)) {
			normalizedOperations.push(operation as OperationKind)
		}
	}

	return immutableArray(normalizedOperations)
}

const assertContributionOptions = (options: unknown): void => {
	if (!isPlainRecord(options)) {
		throw new TypeError('runtime contribution options must be a plain object')
	}

	for (const key of Object.keys(options)) {
		if (!contributionOptionKeys.has(key)) {
			throw new TypeError(`runtime contribution contains unknown key: ${key}`)
		}
	}

	if (typeof options.handler !== 'function') {
		throw new TypeError('runtime contribution handler must be a function')
	}

	if (options.schema !== undefined && !Schema.is(options.schema)) {
		throw new TypeError(
			'runtime contribution schema must be a schema definition',
		)
	}
}

const defineRuntimeContribution = <
	const TKind extends RuntimeContributionKind,
	const TSchema extends SchemaDefinition,
	const TOperations extends readonly OperationKind[],
	THandler,
>(
	kind: TKind,
	options: RuntimeContributionOptions<TSchema, TOperations, THandler>,
): RuntimeContributionDefinition<
	TKind,
	TSchema,
	TOperations[number],
	THandler
> => {
	const untrustedOptions: unknown = options
	assertContributionOptions(untrustedOptions)

	const operations = normalizeOperations(options.operations)
	const definition = immutableRecord({
		kind,
		schema: options.schema,
		operations,
	})
	const handler = options.handler

	runtimeContributionImplementations.set(
		definition,
		immutableRecord({
			kind,
			schema: options.schema,
			operations,
			// Matching in the stage composer narrows the erased operation before this closure runs.
			run: (input) => (handler as ErasedRuntimeContributionHandler)(input),
		}),
	)

	return definition
}

/** Declares a global or schema-scoped operation transformer before persistence. */
export const beforeOperation = <
	const TSchema extends SchemaDefinition = SchemaDefinition,
	const TOperations extends readonly OperationKind[] = readonly OperationKind[],
>(
	options: BeforeOperationOptions<TSchema, TOperations>,
): BeforeOperationDefinition<TSchema, TOperations[number]> =>
	defineRuntimeContribution('before-operation', options)

/** Declares a global or schema-scoped result transformer before commit. */
export const afterOperation = <
	const TSchema extends SchemaDefinition = SchemaDefinition,
	const TOperations extends readonly OperationKind[] = readonly OperationKind[],
>(
	options: AfterOperationOptions<TSchema, TOperations>,
): AfterOperationDefinition<TSchema, TOperations[number]> =>
	defineRuntimeContribution('after-operation', options)

/** Declares an external effect that can run only after a successful commit. */
export const postCommitEvent = <
	const TSchema extends SchemaDefinition = SchemaDefinition,
	const TOperations extends readonly OperationKind[] = readonly OperationKind[],
>(
	options: PostCommitEventOptions<TSchema, TOperations>,
): PostCommitEventDefinition<TSchema, TOperations[number]> =>
	defineRuntimeContribution('post-commit-event', options)

/**
 * Declares a schema-scoped transformer for one authorized, locked update target.
 *
 * This narrow plugin boundary exists for persisted value objects whose accepted
 * replacement depends on their current value. It never runs for set-based work.
 */
export const preparedOperation = <const TSchema extends SchemaDefinition>(
	options: PreparedOperationOptions<TSchema>,
): PreparedOperationDefinition<TSchema> =>
	defineRuntimeContribution('prepared-operation', {
		...options,
		operations: ['update-one'],
	})

/** Resolves only definitions created by the public factories. */
export const getRuntimeContributionImplementation = (
	value: unknown,
): RuntimeContributionImplementation | undefined =>
	typeof value === 'object' && value !== null
		? runtimeContributionImplementations.get(value)
		: undefined

/** Creates a fresh immutable envelope for every sequential callback. */
export const createBeforeHookInput = <
	const TOperation extends DatabaseOperationAst,
>(
	context: HookContext,
	operation: TOperation,
): RuntimeHookOperationInput<TOperation> =>
	immutableRecord({ context, operation })

/** Creates a fresh immutable envelope for after-hooks and external events. */
export const createAfterHookInput = <
	const TOperation extends DatabaseOperationAst,
>(
	context: HookContext,
	operation: TOperation,
	result: DatabaseOperationResult<TOperation>,
): RuntimeHookResultInput<TOperation> =>
	immutableRecord({ context, operation, result })

/** Creates one isolated envelope for an authorized locked-target transformer. */
export const createPreparedHookInput = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	context: HookContext,
	operation: TOperation,
	target: DatabaseMutationLogicalRecord<TOperation>,
): RuntimePreparedOperationInput<TOperation> =>
	immutableRecord({ context, operation, target })
