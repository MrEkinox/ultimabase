import type { UpdateOneOperationAst } from '../../query/index.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import { immutableRecord, type MaybePromise } from '@ultimabase/shared'

import { assertExactEnumerablePlainObject } from '../../exact-object-validation.js'

import type { RequestContext } from '../context/request-context.js'
import type {
	DatabaseMutationLogicalRecord,
	DatabaseMutationOperationAst,
} from '../database/contracts.js'
import type {
	RuntimeLogicalOperationAst,
	RuntimeLogicalOperationKind,
} from '../pipeline/contracts.js'
import { normalizeRuntimeOperationKinds } from '../operations/characteristics.js'

/** Supplies low-level interceptors with safe execution identity and one operation. */
export interface RuntimeInterceptorOperationInput<
	TOperation extends RuntimeLogicalOperationAst,
> {
	/** Exposes immutable request identity and application-local capabilities. */
	readonly context: RequestContext
	/** Contains the immutable operation observed by the low-level interceptor. */
	readonly operation: TOperation
}

/** Supplies one stable singular preimage after protected policies authorize its row. */
export interface RuntimePreparedOperationInput<
	TOperation extends DatabaseMutationOperationAst,
> extends RuntimeInterceptorOperationInput<TOperation> {
	/** Contains the locked logical object that the mutation would update. */
	readonly target: DatabaseMutationLogicalRecord<TOperation>
}

/** Resolves one authorized update value against its locked current object. */
export type PreparedOperationHandler<TSchema extends SchemaDefinition> = (
	input: RuntimePreparedOperationInput<UpdateOneOperationAst<TSchema>>,
) => MaybePromise<
	Readonly<{ readonly operation: UpdateOneOperationAst<TSchema> }>
>

interface RuntimeContributionOptions<
	TSchema extends SchemaDefinition,
	TOperations extends readonly RuntimeLogicalOperationKind[],
	THandler,
> {
	/** Omitting schema declares a global contribution. */
	readonly schema?: TSchema
	/** Omitting operations subscribes to every terminal kind. */
	readonly operations?: TOperations
	readonly handler: THandler
}

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
	TOperationKind extends RuntimeLogicalOperationKind,
	THandler,
> {
	readonly kind: TKind
	readonly schema: TSchema | undefined
	readonly operations: readonly TOperationKind[] | undefined
	// The phantom handler retains contextual inference without exposing mutable execution state.
	readonly [runtimeContributionType]?: THandler
}

export type PreparedOperationDefinition<
	TSchema extends SchemaDefinition = SchemaDefinition,
> = RuntimeContributionDefinition<
	'prepared-operation',
	TSchema,
	'update-one',
	PreparedOperationHandler<TSchema>
>

type RuntimeContributionKind = 'prepared-operation'

interface RuntimeContributionImplementation {
	readonly kind: RuntimeContributionKind
	readonly schema: SchemaDefinition | undefined
	readonly operations: readonly RuntimeLogicalOperationKind[] | undefined
	run(input: RuntimeContributionInput): MaybePromise<unknown>
}

type RuntimeContributionInput =
	RuntimePreparedOperationInput<DatabaseMutationOperationAst>

type ErasedRuntimeContributionHandler = (
	input: RuntimeContributionInput,
) => MaybePromise<unknown>

const runtimeContributionImplementations = new WeakMap<
	object,
	RuntimeContributionImplementation
>()

const contributionOptionKeys = new Set(['handler', 'operations', 'schema'])

const defineRuntimeContribution = <
	const TKind extends RuntimeContributionKind,
	const TSchema extends SchemaDefinition,
	const TOperations extends readonly RuntimeLogicalOperationKind[],
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
	// Only enumerable string keys are option names; symbol keys are ignored.
	assertExactEnumerablePlainObject(
		untrustedOptions,
		contributionOptionKeys,
		'runtime contribution options must be a plain object',
		'runtime contribution contains unknown key: ',
	)
	if (typeof options.handler !== 'function') {
		throw new TypeError('runtime contribution handler must be a function')
	}
	if (options.schema !== undefined && !Schema.is(options.schema)) {
		throw new TypeError(
			'runtime contribution schema must be a schema definition',
		)
	}

	const operations = normalizeRuntimeOperationKinds(
		options.operations,
		'runtime',
	)
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

/** Resolves only definitions created by `preparedOperation()`. */
export const getRuntimeContributionImplementation = (
	value: unknown,
): RuntimeContributionImplementation | undefined =>
	typeof value === 'object' && value !== null
		? runtimeContributionImplementations.get(value)
		: undefined
