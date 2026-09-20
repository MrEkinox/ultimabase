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

import type { RequestContext } from '../context/request-context.js'
import type {
	DatabaseMutationLogicalRecord,
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
} from '../database/contracts.js'
import type { RuntimeOperationResult } from '../pipeline/contracts.js'
/** Supplies low-level interceptors with safe execution identity and one operation. */
export interface RuntimeInterceptorOperationInput<
	TOperation extends DatabaseOperationAst,
> {
	/** Exposes immutable request identity and application-local capabilities. */
	readonly context: RequestContext
	/** Contains the immutable operation observed by the low-level interceptor. */
	readonly operation: TOperation
}

/** Supplies low-level result interceptors without exposing mutable request state. */
export interface RuntimeInterceptorResultInput<
	TOperation extends DatabaseOperationAst,
> extends RuntimeInterceptorOperationInput<TOperation> {
	/** Contains the immutable hydrated result paired with the observed operation. */
	readonly result: RuntimeOperationResult<TOperation>
}

/** Supplies one stable singular preimage after protected policies authorize its row. */
export interface RuntimePreparedOperationInput<
	TOperation extends DatabaseMutationOperationAst,
> extends RuntimeInterceptorOperationInput<TOperation> {
	/** Contains the locked logical object that the mutation would update. */
	readonly target: DatabaseMutationLogicalRecord<TOperation>
}

const runtimeOperationKinds = new Set<OperationKind>([
	'find-many',
	'find-one',
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

type RuntimeInterceptorOperation<
	TSchema extends SchemaDefinition,
	TOperationKind extends OperationKind,
> = Extract<ExecutableOperationAst<TSchema>, { readonly kind: TOperationKind }>

/** Makes every result transformation explicit rather than relying on mutation. */
export interface AfterOperationResult<TOperation extends DatabaseOperationAst> {
	readonly result: RuntimeOperationResult<TOperation>
}

/** Observes the final operation before persistence without replacing its AST. */
export type BeforeOperationHandler<
	TSchema extends SchemaDefinition,
	TOperationKind extends OperationKind,
> = (
	input: RuntimeInterceptorOperationInput<
		RuntimeInterceptorOperation<TSchema, TOperationKind>
	>,
) => MaybePromise<void>

export type AfterOperationHandler<
	TSchema extends SchemaDefinition,
	TOperationKind extends OperationKind,
> = (
	input: RuntimeInterceptorResultInput<
		RuntimeInterceptorOperation<TSchema, TOperationKind>
	>,
) => MaybePromise<
	AfterOperationResult<RuntimeInterceptorOperation<TSchema, TOperationKind>>
>

/** Resolves one authorized update value against its locked current object. */
export type PreparedOperationHandler<TSchema extends SchemaDefinition> = (
	input: RuntimePreparedOperationInput<UpdateOneOperationAst<TSchema>>,
) => MaybePromise<
	Readonly<{ readonly operation: UpdateOneOperationAst<TSchema> }>
>

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

type RuntimeContributionKind =
	'after-operation' | 'before-operation' | 'prepared-operation'

interface RuntimeContributionImplementation {
	readonly kind: RuntimeContributionKind
	readonly schema: SchemaDefinition | undefined
	readonly operations: readonly OperationKind[] | undefined
	run(input: RuntimeContributionInput): MaybePromise<unknown>
}

type RuntimeContributionInput =
	| RuntimeInterceptorOperationInput<DatabaseOperationAst>
	| RuntimePreparedOperationInput<DatabaseMutationOperationAst>
	| RuntimeInterceptorResultInput<DatabaseOperationAst>

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

/** Declares a global or schema-scoped operation observer before persistence. */
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
export const createBeforeContributionInput = <
	const TOperation extends DatabaseOperationAst,
>(
	context: RequestContext,
	operation: TOperation,
): RuntimeInterceptorOperationInput<TOperation> =>
	immutableRecord({ context, operation })

/** Creates a fresh immutable envelope for result interceptors and observers. */
export const createAfterContributionInput = <
	const TOperation extends DatabaseOperationAst,
>(
	context: RequestContext,
	operation: TOperation,
	result: RuntimeOperationResult<TOperation>,
): RuntimeInterceptorResultInput<TOperation> =>
	immutableRecord({ context, operation, result })

/** Creates one isolated envelope for an authorized locked-target transformer. */
export const createPreparedContributionInput = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	context: RequestContext,
	operation: TOperation,
	target: DatabaseMutationLogicalRecord<TOperation>,
): RuntimePreparedOperationInput<TOperation> =>
	immutableRecord({ context, operation, target })
