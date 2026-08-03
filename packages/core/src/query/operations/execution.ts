import { AsyncLocalStorage } from 'node:async_hooks'

import { FrameworkError, type PluginDefinition } from '../../foundation.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { QueryFilterExpression } from '../filters/logical.js'
import type { UltimaBase } from '../../runtime/application/ultima-base.js'
import type { RequestContext } from '../../runtime/context/request-context.js'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type {
	AtomicBulkOperationOptions,
	BulkOperationResult,
	OperationAstNode,
} from './contracts.js'
import { normalizeBulkOperationOptions } from './bulk.js'
import type { InferOperationResult } from './results.js'

/** Identifies any concrete UltimaBase facade without exposing its plugin tuple. */
type QueryUltimaBase = UltimaBase<
	readonly SchemaDefinition[],
	readonly PluginDefinition[]
>

/**
 * Selects inherited, plugin-derived, or audited-master terminal execution.
 * Omitting `context` and `useMasterKey` inherits the active request.
 *
 * @example `await Post.query().find()`
 * @example `await Post.query().find({ ultimabase })`
 */
export interface QueryTerminalOptions {
	/**
	 * Selects an immutable plugin-derived context without accepting credentials.
	 * Combine it with `useMasterKey: true` to elevate that exact context.
	 *
	 * @example `await Post.query().find({ context, ultimabase })`
	 */
	readonly context?: RequestContext
	/**
	 * Selects the exact started application used to create an anonymous root request.
	 * It is required with an explicit context outside an active request scope.
	 *
	 * @example `await Post.query().find({ ultimabase })`
	 */
	readonly ultimabase?: QueryUltimaBase
	/**
	 * Requests audited master authority from trusted backend code only.
	 * Transport input and serialized Query data must never supply this option.
	 *
	 * @example `await Post.query().find({ useMasterKey: true })`
	 * @example `await Post.query().find({ context, ultimabase, useMasterKey: true })`
	 */
	readonly useMasterKey?: true
}

/** Keeps the default all-or-nothing collection contract. */
export interface QueryAtomicBulkTerminalOptions extends QueryTerminalOptions {
	/** Keeps every item all-or-nothing inside one transaction. Defaults to `true`. */
	readonly atomic?: true
}

/** Selects an explicit stopped-prefix result instead of all-or-nothing failure. */
export interface QueryNonAtomicBulkTerminalOptions extends QueryTerminalOptions {
	/** Commits the successful prefix and reports the first persistence failure. */
	readonly atomic: false
}

/** Combines collection grouping with the same terminal-only execution ownership. */
export interface QueryBulkTerminalOptions extends QueryTerminalOptions {
	/** Keeps all items all-or-nothing, or selects an explicit stopped-prefix result. */
	readonly atomic?: boolean
}

/** Infers the collection result selected by one public terminal option value. */
export type QueryBulkTerminalResult<
	TResult,
	TOptions extends QueryBulkTerminalOptions | undefined,
> = BulkOperationResult<TResult, QueryBulkAtomic<TOptions>>

/** Retains the normalized atomic literal selected by one terminal option value. */
export type QueryBulkAtomic<
	TOptions extends QueryBulkTerminalOptions | undefined,
> = [TOptions] extends [undefined]
	? true
	: TOptions extends QueryNonAtomicBulkTerminalOptions
		? false
		: TOptions extends QueryAtomicBulkTerminalOptions
			? true
			: boolean

/** @internal Carries validated server-only choices outside every Query and operation AST. */
export interface NormalizedQueryTerminalOptions {
	readonly context: object | undefined
	readonly ultimabase: object | undefined
	readonly useMasterKey: boolean
}

interface NormalizedQueryBulkTerminalOptions<
	TAtomic extends boolean = boolean,
> extends NormalizedQueryTerminalOptions {
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

/** @internal Carries one protected object predicate outside the transformable Query AST. */
export interface QueryRowFilterPrivateScope {
	readonly kind: 'row-filter'
	/** Makes protected singular object absence and Access denial indistinguishable. */
	readonly nativeAccessDeniedAsMissing?: true
	/** Retains framework-owned identity for relation mutation orchestration only. */
	readonly objectId?: string
	readonly rowFilter: QueryFilterExpression
}

/** @internal Identifies one relation edge without exposing it to Query or hook ASTs. */
export interface QueryRelationPrivateScope {
	readonly kind: 'relation'
	readonly fieldPath: readonly string[]
	readonly source: SchemaDefinition
	readonly sourceObjectId: string
	readonly target: SchemaDefinition
}

/** @internal Keeps framework-owned Query restrictions behind one closed union. */
export type QueryTerminalPrivateScope =
	QueryRelationPrivateScope | QueryRowFilterPrivateScope

/** @internal Resolves authority without adding execution state to a Query instance. */
export type QueryTerminalExecutionHandler = (
	operation: unknown,
	options: NormalizedQueryTerminalOptions,
	scope: QueryTerminalPrivateScope | undefined,
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
const queryTerminalExecutionHandlers = new WeakMap<
	QueryExecutionDispatcher,
	QueryTerminalExecutionHandler
>()
const emptyTerminalOptions: NormalizedQueryTerminalOptions = immutableRecord({
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
			throw new TypeError(`query terminal options contain unknown key: ${key}`)
		}
	}
}

/** Validates authority values after the caller-specific key set is checked. */
const normalizeQueryAuthorityOptions = (
	options: Readonly<Record<string, unknown>>,
): NormalizedQueryTerminalOptions => {
	const context: unknown = options.context
	const ultimabase: unknown = options.ultimabase
	const useMasterKey: unknown = options.useMasterKey

	if (
		context !== undefined &&
		(typeof context !== 'object' || context === null)
	) {
		throw new TypeError(
			'query terminal context must be a RequestContext instance',
		)
	}

	if (
		ultimabase !== undefined &&
		(typeof ultimabase !== 'object' || ultimabase === null)
	) {
		throw new TypeError(
			'query terminal ultimabase must be an UltimaBase instance',
		)
	}

	if (useMasterKey !== undefined && useMasterKey !== true) {
		throw new TypeError('query terminal useMasterKey must be true when present')
	}

	return immutableRecord({
		context,
		ultimabase,
		useMasterKey: useMasterKey === true,
	})
}

/** Snapshots the public terminal boundary before asynchronous execution starts. */
export const normalizeQueryTerminalOptions = (
	options: QueryTerminalOptions | undefined,
): NormalizedQueryTerminalOptions => {
	if (options === undefined) {
		return emptyTerminalOptions
	}

	const untrustedOptions: unknown = options

	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('query terminal options must be a plain object')
	}

	assertKnownOptionKeys(untrustedOptions, false)

	return normalizeQueryAuthorityOptions(untrustedOptions)
}

/** Normalizes bulk behavior and ownership through one shared public options object. */
export const normalizeQueryBulkTerminalOptions = <
	const TOptions extends QueryBulkTerminalOptions | undefined,
>(
	options: TOptions | undefined,
): NormalizedQueryBulkTerminalOptions<QueryBulkAtomic<TOptions>> => {
	if (options === undefined) {
		return immutableRecord({
			...emptyTerminalOptions,
			bulk: normalizeBulkOperationOptions(undefined),
		}) as NormalizedQueryBulkTerminalOptions<QueryBulkAtomic<TOptions>>
	}

	const untrustedOptions: unknown = options

	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('query terminal options must be a plain object')
	}

	assertKnownOptionKeys(untrustedOptions, true)
	const terminal = normalizeQueryAuthorityOptions(untrustedOptions)
	const atomic: unknown = untrustedOptions.atomic

	return immutableRecord({
		...terminal,
		bulk: normalizeBulkOperationOptions(
			atomic === undefined ? undefined : { atomic: atomic as boolean },
		),
	}) as NormalizedQueryBulkTerminalOptions<QueryBulkAtomic<TOptions>>
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
export const registerQueryTerminalExecutionHandler = (
	executor: QueryExecutionDispatcher,
	handler: QueryTerminalExecutionHandler,
): void => {
	if (queryTerminalExecutionHandlers.has(executor)) {
		throw new TypeError(
			'query terminal execution handler is already registered',
		)
	}

	queryTerminalExecutionHandlers.set(executor, handler)
}

/** Applies server-only options through Runtime while leaving the operation untouched. */
const dispatchQueryTerminal = (
	executor: QueryExecutionDispatcher,
	operation: unknown,
	options: NormalizedQueryTerminalOptions,
	scope: QueryTerminalPrivateScope | undefined,
): Promise<unknown> => {
	if (
		options.context === undefined &&
		!options.useMasterKey &&
		scope === undefined
	) {
		return executor.execute(operation)
	}

	const handler = queryTerminalExecutionHandlers.get(executor)

	if (handler === undefined) {
		throw new FrameworkError(
			'MISSING_EXECUTION_CONTEXT',
			'The active query executor cannot apply terminal authority options.',
			{
				publicMessage: 'No request execution context is available.',
				internalDetails: {
					reason: 'query-terminal-authority-unavailable',
				},
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
	registerQueryTerminalExecutionHandler(executor, (operation, options, scope) =>
		guard.run(() =>
			dispatchQueryTerminal(
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

/** Resolves one terminal at call time without retaining execution in its Query AST. */
export const executeQueryTerminal = <const TOperation extends OperationAstNode>(
	operation: TOperation,
	options: NormalizedQueryTerminalOptions,
	scope?: QueryTerminalPrivateScope,
): Promise<InferOperationResult<TOperation>> => {
	const active: ActiveQueryExecution | undefined =
		activeQueryExecution.getStore()
	const owner = options.ultimabase
	const registration =
		owner === undefined ? undefined : queryExecutionOwners.get(owner)

	if (owner !== undefined && registration === undefined) {
		throw new TypeError(
			'query terminal ultimabase must be an UltimaBase instance',
		)
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

		return dispatchQueryTerminal(
			active.executor,
			operation,
			options,
			scope,
		) as Promise<InferOperationResult<TOperation>>
	}

	if (registration === undefined) {
		throw new FrameworkError(
			'MISSING_EXECUTION_CONTEXT',
			'No request is active. Pass { ultimabase } to this Query terminal.',
			{
				publicMessage: 'No request execution context is available.',
				internalDetails: { reason: 'query-terminal-owner-missing' },
			},
		)
	}

	return dispatchQueryTerminal(
		registration.createRootExecutor(),
		operation,
		options,
		scope,
	) as Promise<InferOperationResult<TOperation>>
}
