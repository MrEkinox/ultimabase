import type { ExecutableOperationAst, OperationKind } from '@ultimabase/query'
import { Schema, type SchemaDefinition } from '@ultimabase/schema'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'

import type { RequestContext } from '../context/request-context.js'
import type {
	DatabaseOperationAst,
	DatabaseOperationResult,
} from '../database/contracts.js'
import type {
	RuntimeOperationStageInput,
	RuntimeResultStageInput,
} from '../pipeline/contracts.js'

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
	input: RuntimeOperationStageInput<
		RuntimeHookOperation<TSchema, TOperationKind>
	>,
) => MaybePromise<
	BeforeOperationResult<RuntimeHookOperation<TSchema, TOperationKind>>
>

export type AfterOperationHandler<
	TSchema extends SchemaDefinition,
	TOperationKind extends OperationKind,
> = (
	input: RuntimeResultStageInput<RuntimeHookOperation<TSchema, TOperationKind>>,
) => MaybePromise<
	AfterOperationResult<RuntimeHookOperation<TSchema, TOperationKind>>
>

export type PostCommitEventHandler<
	TSchema extends SchemaDefinition,
	TOperationKind extends OperationKind,
> = (
	input: RuntimeResultStageInput<RuntimeHookOperation<TSchema, TOperationKind>>,
) => MaybePromise<void>

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

export type RuntimeContributionDefinitionUnion =
	| BeforeOperationDefinition
	| AfterOperationDefinition
	| PostCommitEventDefinition

type RuntimeContributionKind =
	'after-operation' | 'before-operation' | 'post-commit-event'

interface RuntimeContributionImplementation {
	readonly kind: RuntimeContributionKind
	readonly schema: SchemaDefinition | undefined
	readonly operations: readonly OperationKind[] | undefined
	run(input: RuntimeContributionInput): MaybePromise<unknown>
}

type RuntimeContributionInput =
	| RuntimeOperationStageInput<DatabaseOperationAst>
	| RuntimeResultStageInput<DatabaseOperationAst>

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
	context: RequestContext,
	operation: TOperation,
): RuntimeOperationStageInput<TOperation> =>
	immutableRecord({ context, operation })

/** Creates a fresh immutable envelope for after-hooks and external events. */
export const createAfterHookInput = <
	const TOperation extends DatabaseOperationAst,
>(
	context: RequestContext,
	operation: TOperation,
	result: DatabaseOperationResult<TOperation>,
): RuntimeResultStageInput<TOperation> =>
	immutableRecord({ context, operation, result })
