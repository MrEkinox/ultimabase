import { AsyncLocalStorage } from 'node:async_hooks'

import { FrameworkError } from '../../foundation.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { QueryFilterExpression } from '../filters/logical.js'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type {
	AtomicBulkOperationOptions,
	BulkOperationResult,
	OperationAstNode,
} from './contracts.js'
import { normalizeBulkAtomicity } from './bulk.js'
import type { BulkOperationOptions, OperationOptions } from './options.js'
import type { InferOperationResult } from './results.js'

/** Infers the collection result selected by one public bulk option value. */
export type InferBulkOperationResult<
	TResult,
	TOptions extends BulkOperationOptions | undefined,
> = BulkOperationResult<TResult, InferBulkOperationAtomicity<TOptions>>

/** Retains the normalized atomic literal selected by one bulk option value. */
export type InferBulkOperationAtomicity<
	TOptions extends BulkOperationOptions | undefined,
> = [TOptions] extends [undefined]
	? true
	: 'atomic' extends keyof TOptions
		? TOptions extends { readonly atomic: false }
			? false
			: TOptions extends { readonly atomic?: true }
				? true
				: boolean
		: true

/** @internal Carries validated server-only choices outside every operation AST. */
export interface NormalizedOperationOptions {
	readonly context: object | undefined
	readonly ultimabase: object | undefined
	readonly useMasterKey: boolean
}

interface NormalizedBulkOperationOptions<
	TAtomic extends boolean = boolean,
> extends NormalizedOperationOptions {
	readonly bulk: AtomicBulkOperationOptions<TAtomic>
}

interface QueryExecutionOwnerRegistration {
	readonly application: object
	readonly createRootExecutor: () => QueryExecutionDispatcher
}

interface ActiveQueryExecution {
	readonly application: object | undefined
	readonly executor: QueryExecutionDispatcher
}

/** Erases schema variance only at the application-owned Runtime bridge. */
export interface QueryExecutionDispatcher {
	execute(operation: unknown): Promise<unknown>
}

/** @internal Carries one protected object predicate outside the transformable QueryBuilder AST. */
export interface QueryRowFilterPrivateScope {
	readonly kind: 'row-filter'
	/** Makes protected singular object absence and Access denial indistinguishable. */
	readonly nativeAccessDeniedAsMissing?: true
	/** Retains framework-owned identity for relation mutation orchestration only. */
	readonly objectId?: string
	readonly rowFilter: QueryFilterExpression
}

/** @internal Identifies one relation edge without exposing it to QueryBuilder or hook ASTs. */
export interface QueryRelationPrivateScope {
	readonly kind: 'relation'
	readonly fieldPath: readonly string[]
	readonly source: SchemaDefinition
	readonly sourceObjectId: string
	readonly target: SchemaDefinition
}

/** @internal Keeps framework-owned restrictions behind one closed union. */
export type OperationPrivateScope =
	QueryRelationPrivateScope | QueryRowFilterPrivateScope

/** @internal Resolves authority without adding execution state to a QueryBuilder instance. */
export type OperationExecutionHandler = (
	operation: unknown,
	options: NormalizedOperationOptions,
	scope: OperationPrivateScope | undefined,
) => Promise<unknown>

/** Lets Runtime add one revocable boundary without exposing hook internals here. */
export interface QueryExecutionGuard {
	run<TResult>(operation: () => Promise<TResult>): Promise<TResult>
}

const activeQueryExecution = new AsyncLocalStorage<ActiveQueryExecution>()
const queryExecutionOwners = new WeakMap<
	object,
	QueryExecutionOwnerRegistration
>()
const operationExecutionHandlers = new WeakMap<
	QueryExecutionDispatcher,
	OperationExecutionHandler
>()
const emptyOperationOptions: NormalizedOperationOptions = immutableRecord({
	context: undefined,
	ultimabase: undefined,
	useMasterKey: false,
})

const assertKnownOptionKeys = (
	options: Readonly<Record<string, unknown>>,
	bulk: boolean,
): void => {
	for (const key of Object.keys(options)) {
		if (
			key !== 'context' &&
			key !== 'ultimabase' &&
			key !== 'useMasterKey' &&
			(!bulk || key !== 'atomic')
		) {
			throw new TypeError(`operation options contain unknown key: ${key}`)
		}
	}
}

/** Validates authority values after the caller-specific key set is checked. */
const normalizeOperationAuthority = (
	options: Readonly<Record<string, unknown>>,
): NormalizedOperationOptions => {
	const context: unknown = options.context
	const ultimabase: unknown = options.ultimabase
	const useMasterKey: unknown = options.useMasterKey

	if (
		context !== undefined &&
		(typeof context !== 'object' || context === null)
	) {
		throw new TypeError('operation context must be a RequestContext instance')
	}

	if (
		ultimabase !== undefined &&
		(typeof ultimabase !== 'object' || ultimabase === null)
	) {
		throw new TypeError('operation ultimabase must be an UltimaBase instance')
	}

	if (useMasterKey !== undefined && useMasterKey !== true) {
		throw new TypeError('operation useMasterKey must be true when present')
	}

	return immutableRecord({
		context,
		ultimabase,
		useMasterKey: useMasterKey === true,
	})
}

/** Snapshots the public terminal boundary before asynchronous execution starts. */
export const normalizeOperationOptions = (
	options: OperationOptions | undefined,
): NormalizedOperationOptions => {
	if (options === undefined) {
		return emptyOperationOptions
	}

	const untrustedOptions: unknown = options

	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('operation options must be a plain object')
	}

	assertKnownOptionKeys(untrustedOptions, false)

	return normalizeOperationAuthority(untrustedOptions)
}

/** Normalizes bulk behavior and ownership through one shared public options object. */
export const normalizeBulkOperationOptions = <
	const TOptions extends BulkOperationOptions | undefined,
>(
	options: TOptions | undefined,
): NormalizedBulkOperationOptions<InferBulkOperationAtomicity<TOptions>> => {
	if (options === undefined) {
		return immutableRecord({
			...emptyOperationOptions,
			bulk: normalizeBulkAtomicity(undefined),
		}) as NormalizedBulkOperationOptions<InferBulkOperationAtomicity<TOptions>>
	}

	const untrustedOptions: unknown = options

	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('operation options must be a plain object')
	}

	assertKnownOptionKeys(untrustedOptions, true)
	const operation = normalizeOperationAuthority(untrustedOptions)
	const atomic: unknown = untrustedOptions.atomic

	return immutableRecord({
		...operation,
		bulk: normalizeBulkAtomicity(
			atomic === undefined ? undefined : { atomic: atomic as boolean },
		),
	}) as NormalizedBulkOperationOptions<InferBulkOperationAtomicity<TOptions>>
}

/** Registers one facade-owned root executor without creating a default application. */
export const registerQueryExecutionOwner = (
	owner: object,
	registration: QueryExecutionOwnerRegistration,
): void => {
	if (queryExecutionOwners.has(owner)) {
		throw new TypeError('query execution owner is already registered')
	}

	queryExecutionOwners.set(owner, immutableRecord(registration))
}

/** Registers one Runtime-owned authority resolver for an erased executor. */
export const registerOperationExecutionHandler = (
	executor: QueryExecutionDispatcher,
	handler: OperationExecutionHandler,
): void => {
	if (operationExecutionHandlers.has(executor)) {
		throw new TypeError('operation execution handler is already registered')
	}

	operationExecutionHandlers.set(executor, handler)
}

/** Applies server-only options through Runtime while leaving the operation untouched. */
const dispatchOperation = (
	executor: QueryExecutionDispatcher,
	operation: unknown,
	options: NormalizedOperationOptions,
	scope: OperationPrivateScope | undefined,
): Promise<unknown> => {
	if (
		options.context === undefined &&
		!options.useMasterKey &&
		scope === undefined
	) {
		return executor.execute(operation)
	}

	const handler = operationExecutionHandlers.get(executor)

	if (handler === undefined) {
		throw new FrameworkError(
			'MISSING_EXECUTION_CONTEXT',
			'The active query executor cannot apply terminal authority options.',
			{
				publicMessage: 'No request execution context is available.',
				internalDetails: { reason: 'operation-authority-unavailable' },
			},
		)
	}

	return handler(operation, options, scope)
}

/** Runs ordinary terminals through one exact request engine in this async branch. */
export const runWithQueryExecution = <TResult>(
	application: object,
	executor: QueryExecutionDispatcher,
	callback: () => TResult,
): TResult =>
	activeQueryExecution.run(immutableRecord({ application, executor }), callback)

/** Narrows the current execution scope with a hook-owned revocable lease. */
export const runWithQueryExecutionGuard = <TResult>(
	guard: QueryExecutionGuard,
	callback: () => TResult,
): TResult => {
	const parent: ActiveQueryExecution | undefined =
		activeQueryExecution.getStore()
	const requireParent = (): ActiveQueryExecution => {
		if (parent === undefined) {
			throw new FrameworkError(
				'MISSING_EXECUTION_CONTEXT',
				'Hook queries require an active operation engine.',
				{
					publicMessage: 'Queries are not available during this hook phase.',
					internalDetails: { reason: 'hook-query-engine-unavailable' },
				},
			)
		}

		return parent
	}
	const executor: QueryExecutionDispatcher = immutableRecord({
		execute: (operation) =>
			guard.run(() => requireParent().executor.execute(operation)),
	})

	// Authority resolution stays behind the same revocable hook lease.
	registerOperationExecutionHandler(executor, (operation, options, scope) =>
		guard.run(() =>
			dispatchOperation(
				requireParent().executor,
				operation,
				options,
				scope,
			),
		),
	)

	return activeQueryExecution.run(
		immutableRecord({ application: parent?.application, executor }),
		callback,
	)
}

/** Resolves one terminal at call time without retaining execution in its QueryBuilder AST. */
export const executeOperation = <const TOperation extends OperationAstNode>(
	operation: TOperation,
	options: NormalizedOperationOptions,
	scope?: OperationPrivateScope,
): Promise<InferOperationResult<TOperation>> => {
	const active: ActiveQueryExecution | undefined =
		activeQueryExecution.getStore()
	const owner = options.ultimabase
	const registration =
		owner === undefined ? undefined : queryExecutionOwners.get(owner)

	if (owner !== undefined && registration === undefined) {
		throw new TypeError('operation ultimabase must be an UltimaBase instance')
	}

	if (active !== undefined) {
		if (
			registration !== undefined &&
			active.application !== undefined &&
			registration.application !== active.application
		) {
			throw new FrameworkError(
				'VALIDATION_ERROR',
				'Explicit query ownership cannot replace the active application.',
				{ publicMessage: 'The requested schema is not available.' },
			)
		}

		return dispatchOperation(
			active.executor,
			operation,
			options,
			scope,
		) as Promise<InferOperationResult<TOperation>>
	}

	if (registration === undefined) {
		throw new FrameworkError(
			'MISSING_EXECUTION_CONTEXT',
			'No request is active. Pass { ultimabase } to this schema operation.',
			{
				publicMessage: 'No request execution context is available.',
				internalDetails: { reason: 'operation-owner-missing' },
			},
		)
	}

	return dispatchOperation(
		registration.createRootExecutor(),
		operation,
		options,
		scope,
	) as Promise<InferOperationResult<TOperation>>
}
