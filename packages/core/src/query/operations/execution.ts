import { AsyncLocalStorage } from 'node:async_hooks'

import { FrameworkError } from '../../foundation.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { QueryFilterExpression } from '../filters/logical.js'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { FindManyOperationAst, OperationAstNode } from './contracts.js'
import type { OperationOptions } from './options.js'
import type { OperationResult } from './results.js'

/** @internal Carries validated server-only choices outside every operation AST. */
export interface NormalizedOperationOptions {
	readonly context: object | undefined
	readonly ultimabase: object | undefined
	readonly useMasterKey: boolean
}

interface QueryExecutionOwnerRegistration {
	readonly application: object
	readonly bindResult: (value: unknown) => unknown
	readonly createRootExecutor: () => QueryExecutionDispatcher
	readonly executeSchemaMutation: (
		schema: SchemaDefinition,
		name: string,
		input: unknown,
		options: OperationOptions | undefined,
	) => Promise<unknown>
}

interface ActiveQueryExecution {
	readonly application: object | undefined
	readonly executor: QueryExecutionDispatcher
}

interface OperationExecutionSelection {
	readonly active: ActiveQueryExecution | undefined
	readonly registration: QueryExecutionOwnerRegistration | undefined
}

/** Erases schema variance only at the application-owned Runtime bridge. */
export interface QueryExecutionDispatcher {
	execute(operation: unknown): Promise<unknown>
}

/** @internal Describes one item inside an atomic schema-command batch. */
export interface OperationBatchEntry<
	TOperation extends OperationAstNode = OperationAstNode,
> {
	readonly operation: TOperation
	/** Requires the directed mutation target to exist before the batch may commit. */
	readonly requireResult?: true
}

/** @internal Carries one result projection shared by every item in an atomic batch. */
export interface OperationBatchProjection {
	readonly operation: FindManyOperationAst<SchemaDefinition>
}

/** @internal Carries one protected object predicate outside the transformable QueryBuilder AST. */
export interface QueryRowFilterPrivateScope {
	readonly kind: 'row-filter'
	/** Makes protected singular object absence and policy denial indistinguishable. */
	readonly protectedPolicyDeniedAsMissing?: true
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

/** Executes item operations through one Runtime-owned transaction boundary. */
export type OperationBatchExecutionHandler = (
	entries: readonly OperationBatchEntry[],
	options: NormalizedOperationOptions,
	projection: OperationBatchProjection | undefined,
) => Promise<readonly unknown[]>

/** Lets Runtime add one revocable boundary without exposing hook internals here. */
export interface QueryExecutionGuard {
	run<TResult>(operation: () => Promise<TResult>): Promise<TResult>
}

const activeQueryExecution = new AsyncLocalStorage<ActiveQueryExecution>()
const queryExecutionOwners = new WeakMap<
	object,
	QueryExecutionOwnerRegistration
>()
const queryExecutionApplications = new WeakMap<
	object,
	QueryExecutionOwnerRegistration
>()
const operationExecutionHandlers = new WeakMap<
	QueryExecutionDispatcher,
	OperationExecutionHandler
>()
const operationBatchExecutionHandlers = new WeakMap<
	QueryExecutionDispatcher,
	OperationBatchExecutionHandler
>()
const emptyOperationOptions: NormalizedOperationOptions = immutableRecord({
	context: undefined,
	ultimabase: undefined,
	useMasterKey: false,
})

const assertKnownOptionKeys = (
	options: Readonly<Record<string, unknown>>,
): void => {
	for (const key of Object.keys(options)) {
		if (key !== 'context' && key !== 'ultimabase' && key !== 'useMasterKey') {
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

	assertKnownOptionKeys(untrustedOptions)

	return normalizeOperationAuthority(untrustedOptions)
}

/** Registers one facade-owned root executor without creating a default application. */
export const registerQueryExecutionOwner = (
	owner: object,
	registration: QueryExecutionOwnerRegistration,
): void => {
	if (queryExecutionOwners.has(owner)) {
		throw new TypeError('query execution owner is already registered')
	}
	if (queryExecutionApplications.has(registration.application)) {
		throw new TypeError('query execution application is already registered')
	}

	const normalized = immutableRecord(registration)
	queryExecutionOwners.set(owner, normalized)
	queryExecutionApplications.set(registration.application, normalized)
}

/** Selects one explicit or ambient owner without creating execution state. */
const resolveOperationExecutionSelection = (
	options: NormalizedOperationOptions,
): OperationExecutionSelection => {
	const active: ActiveQueryExecution | undefined =
		activeQueryExecution.getStore()
	const owner = options.ultimabase
	const explicit =
		owner === undefined ? undefined : queryExecutionOwners.get(owner)

	if (owner !== undefined && explicit === undefined) {
		throw new TypeError('operation ultimabase must be an UltimaBase instance')
	}
	if (
		active?.application !== undefined &&
		explicit !== undefined &&
		active.application !== explicit.application
	) {
		throw new FrameworkError(
			'VALIDATION_ERROR',
			'Explicit query ownership cannot replace the active application.',
			{ publicMessage: 'The requested schema is not available.' },
		)
	}

	return immutableRecord({
		active,
		registration:
			explicit ??
			(active?.application === undefined
				? undefined
				: queryExecutionApplications.get(active.application)),
	})
}

/** Dispatches one class-level plugin method through the selected application only. */
export const executeStaticSchemaMutation = async (
	schema: SchemaDefinition,
	name: string,
	input: unknown,
	options?: OperationOptions,
): Promise<unknown> => {
	const normalized = normalizeOperationOptions(options)
	const { registration } = resolveOperationExecutionSelection(normalized)
	if (registration === undefined) {
		throw new FrameworkError(
			'MISSING_EXECUTION_CONTEXT',
			'No request is active. Pass { ultimabase } to this schema operation.',
			{ publicMessage: 'No request execution context is available.' },
		)
	}
	return registration.executeSchemaMutation(schema, name, input, options)
}

/** @internal Rejects a terminal facade that belongs to another application. */
export const assertOperationExecutionOwner = (
	owner: object | undefined,
	expectedApplication: object,
): void => {
	if (owner === undefined) return
	const registration = queryExecutionOwners.get(owner)
	if (registration === undefined) {
		throw new TypeError('operation ultimabase must be an UltimaBase instance')
	}
	if (registration.application !== expectedApplication) {
		throw new FrameworkError(
			'VALIDATION_ERROR',
			'Explicit query ownership cannot replace the active application.',
			{ publicMessage: 'The requested schema is not available.' },
		)
	}
}

const bindExecutionResult = async <TResult>(
	result: Promise<TResult>,
	registration: QueryExecutionOwnerRegistration | undefined,
): Promise<TResult> => {
	const value = await result
	return (registration?.bindResult(value) ?? value) as TResult
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

/** Registers one Runtime-owned atomic batch resolver for an erased executor. */
export const registerOperationBatchExecutionHandler = (
	executor: QueryExecutionDispatcher,
	handler: OperationBatchExecutionHandler,
): void => {
	if (operationBatchExecutionHandlers.has(executor)) {
		throw new TypeError(
			'operation batch execution handler is already registered',
		)
	}

	operationBatchExecutionHandlers.set(executor, handler)
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

/** Routes one atomic item batch without exposing Runtime transactions to Query. */
const dispatchOperationBatch = (
	executor: QueryExecutionDispatcher,
	entries: readonly OperationBatchEntry[],
	options: NormalizedOperationOptions,
	projection: OperationBatchProjection | undefined,
): Promise<readonly unknown[]> => {
	const handler = operationBatchExecutionHandlers.get(executor)

	if (handler === undefined) {
		throw new FrameworkError(
			'MISSING_EXECUTION_CONTEXT',
			'The active query executor cannot execute atomic operation batches.',
			{
				publicMessage: 'No request execution context is available.',
				internalDetails: { reason: 'operation-batch-unavailable' },
			},
		)
	}

	return handler(entries, options, projection)
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
			dispatchOperation(requireParent().executor, operation, options, scope),
		),
	)
	registerOperationBatchExecutionHandler(
		executor,
		(entries, options, projection) =>
			guard.run(() =>
				dispatchOperationBatch(
					requireParent().executor,
					entries,
					options,
					projection,
				),
			),
	)

	return activeQueryExecution.run(
		immutableRecord({ application: parent?.application, executor }),
		callback,
	)
}

/** Executes ordered item operations inside one all-or-nothing Runtime transaction. */
export const executeOperationBatch = <
	const TOperation extends OperationAstNode,
>(
	entries: readonly OperationBatchEntry<TOperation>[],
	options: NormalizedOperationOptions,
	projection?: OperationBatchProjection,
): Promise<readonly OperationResult<TOperation>[]> => {
	const { active, registration } = resolveOperationExecutionSelection(options)
	if (active !== undefined) {
		return bindExecutionResult(
			dispatchOperationBatch(
				active.executor,
				entries,
				options,
				projection,
			) as Promise<readonly OperationResult<TOperation>[]>,
			registration,
		)
	}

	if (registration === undefined) {
		throw new FrameworkError(
			'MISSING_EXECUTION_CONTEXT',
			'No request is active. Pass { ultimabase } to this schema operation.',
			{
				publicMessage: 'No request execution context is available.',
				internalDetails: { reason: 'query-executor-unavailable' },
			},
		)
	}

	const executor = registration.createRootExecutor()

	return bindExecutionResult(
		dispatchOperationBatch(executor, entries, options, projection) as Promise<
			readonly OperationResult<TOperation>[]
		>,
		registration,
	)
}

/** Resolves one terminal at call time without retaining execution in its QueryBuilder AST. */
export const executeOperation = <const TOperation extends OperationAstNode>(
	operation: TOperation,
	options: NormalizedOperationOptions,
	scope?: OperationPrivateScope,
): Promise<OperationResult<TOperation>> => {
	const { active, registration } = resolveOperationExecutionSelection(options)
	if (active !== undefined) {
		return bindExecutionResult(
			dispatchOperation(active.executor, operation, options, scope) as Promise<
				OperationResult<TOperation>
			>,
			registration,
		)
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

	return bindExecutionResult(
		dispatchOperation(
			registration.createRootExecutor(),
			operation,
			options,
			scope,
		) as Promise<OperationResult<TOperation>>,
		registration,
	)
}
