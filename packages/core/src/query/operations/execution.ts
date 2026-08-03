import { AsyncLocalStorage } from 'node:async_hooks'

import { FrameworkError, type PluginDefinition } from '../../foundation.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { UltimaBase } from '../../runtime/application/ultima-base.js'
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

/** Supplies execution ownership only when no request or hook scope is active. */
export interface QueryTerminalOptions {
	/**
	 * Selects the exact started application used to create an anonymous root request.
	 * Omit this property inside an active request, transaction, or queryable hook.
	 *
	 * @example `await Post.query().find({ ultimabase })`
	 */
	readonly ultimabase?: QueryUltimaBase
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

interface NormalizedQueryTerminalOptions {
	readonly ultimabase: object | undefined
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

/** Lets Runtime add one revocable boundary without exposing hook internals here. */
export interface QueryExecutionGuard {
	run<TResult>(operation: () => Promise<TResult>): Promise<TResult>
}

const activeQueryExecution = new AsyncLocalStorage<ActiveQueryExecution>()
const queryExecutionOwners = new WeakMap<
	object,
	QueryExecutionOwnerRegistration
>()
const emptyTerminalOptions: NormalizedQueryTerminalOptions = immutableRecord({
	ultimabase: undefined,
})

const assertKnownOptionKeys = (
	options: Readonly<Record<string, unknown>>,
	bulk: boolean,
): void => {
	for (const key of Object.keys(options)) {
		if (key !== 'ultimabase' && (!bulk || key !== 'atomic')) {
			throw new TypeError(`query terminal options contain unknown key: ${key}`)
		}
	}
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

	const ultimabase: unknown = untrustedOptions.ultimabase

	if (
		ultimabase !== undefined &&
		(typeof ultimabase !== 'object' || ultimabase === null)
	) {
		throw new TypeError(
			'query terminal ultimabase must be an UltimaBase instance',
		)
	}

	return immutableRecord({ ultimabase })
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
	const terminal = normalizeQueryTerminalOptions(
		untrustedOptions.ultimabase === undefined
			? undefined
			: { ultimabase: untrustedOptions.ultimabase as QueryUltimaBase },
	)
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
	const executor: QueryExecutionDispatcher = immutableRecord({
		execute: (operation) =>
			guard.run(() => {
				if (parent === undefined) {
					throw new FrameworkError(
						'MISSING_EXECUTION_CONTEXT',
						'Hook queries require an active operation engine.',
						{
							publicMessage:
								'Queries are not available during this hook phase.',
							internalDetails: {
								reason: 'hook-query-engine-unavailable',
							},
						},
					)
				}

				return parent.executor.execute(operation)
			}),
	})

	return activeQueryExecution.run(
		immutableRecord({ application: parent?.application, executor }),
		callback,
	)
}

/** Resolves one terminal at call time without retaining execution in its Query AST. */
export const executeQueryTerminal = <const TOperation extends OperationAstNode>(
	operation: TOperation,
	options: NormalizedQueryTerminalOptions,
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

		return active.executor.execute(operation) as Promise<
			InferOperationResult<TOperation>
		>
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

	return registration.createRootExecutor().execute(operation) as Promise<
		InferOperationResult<TOperation>
	>
}
