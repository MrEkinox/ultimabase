import { AsyncLocalStorage } from 'node:async_hooks'

import { readActiveApplicationOwner } from '../../application/active-application.js'
import { FrameworkError } from '../../foundation.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { QueryFilterExpression } from '../filters/logical.js'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type {
	ExecutableOperationAst,
	FindManyOperationAst,
	OperationAstNode,
} from './contracts.js'
import type { OperationOptions } from './options.js'
import type { OperationResult } from './results.js'

/** Defines the neutral execution shape required by contextual operations. */
export interface QueryOperationExecutor<
	TSchema extends SchemaDefinition = SchemaDefinition,
> {
	execute<const TOperation extends ExecutableOperationAst<TSchema>>(
		operation: TOperation,
	): Promise<OperationResult<TOperation>>
}

/** @internal Carries validated server-only choices outside every operation AST. */
export interface NormalizedOperationOptions {
	readonly context: object | undefined
	readonly useMasterKey: boolean
}

const emptyNormalizedOperationOptions: NormalizedOperationOptions =
	immutableRecord({ context: undefined, useMasterKey: false })

/** Snapshots the public terminal boundary before asynchronous execution starts. */
export const normalizeOperationOptions = (
	options: OperationOptions | undefined,
): NormalizedOperationOptions => {
	if (options === undefined) return emptyNormalizedOperationOptions

	const untrustedOptions: unknown = options

	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('operation options must be a plain object')
	}

	for (const key of Object.keys(untrustedOptions)) {
		if (key !== 'context' && key !== 'useMasterKey') {
			throw new TypeError(`operation options contain unknown key: ${key}`)
		}
	}

	const { context, useMasterKey } = untrustedOptions

	if (
		context !== undefined &&
		(typeof context !== 'object' || context === null)
	) {
		throw new TypeError('operation context must be a RequestContext instance')
	}

	if (useMasterKey !== undefined && useMasterKey !== true) {
		throw new TypeError('operation useMasterKey must be true when present')
	}

	return immutableRecord({ context, useMasterKey: useMasterKey === true })
}

interface QueryExecutionOwnerRegistrationInput {
	readonly application: object
	readonly bindResult: (
		value: unknown,
		ownerToken: OperationExecutionOwnerToken,
	) => unknown
	readonly createRootExecutor: () => QueryExecutionDispatcher
	readonly executeModelSchemaMutation: (
		model: object,
		schema: SchemaDefinition,
		name: string,
		input: unknown,
		options: OperationOptions | undefined,
	) => Promise<unknown>
	readonly executeSchemaMutation: (
		schema: SchemaDefinition,
		name: string,
		input: unknown,
		options: OperationOptions | undefined,
	) => Promise<unknown>
}

interface QueryExecutionOwnerRegistration extends QueryExecutionOwnerRegistrationInput {
	readonly ownerToken: OperationExecutionOwnerToken
}

/** @internal Identifies one application result without retaining its resources. */
export type OperationExecutionOwnerToken = symbol

interface ActiveQueryExecution {
	readonly application: object | undefined
	readonly executor: QueryExecutionDispatcher
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

const missingExecutionContext = (
	message: string,
	publicMessage: string,
	reason?: string,
): FrameworkError<'MISSING_EXECUTION_CONTEXT'> =>
	new FrameworkError('MISSING_EXECUTION_CONTEXT', message, {
		publicMessage,
		...(reason === undefined ? {} : { internalDetails: { reason } }),
	})

const missingOwner = (reason?: string): FrameworkError =>
	missingExecutionContext(
		'No initialized active application owns this schema operation.',
		'No application execution context is available.',
		reason,
	)

/** Registers one application-owned root executor without creating a default application. */
export const registerQueryExecutionOwner = (
	registration: QueryExecutionOwnerRegistrationInput,
): OperationExecutionOwnerToken => {
	if (queryExecutionApplications.has(registration.application)) {
		throw new TypeError('query execution application is already registered')
	}

	const normalized: QueryExecutionOwnerRegistration = immutableRecord({
		...registration,
		ownerToken: Symbol('ultimabase.operation-execution-owner'),
	})
	queryExecutionApplications.set(registration.application, normalized)
	return normalized.ownerToken
}

/** Selects the ambient executor and its owner without creating execution state. */
const resolveOperationExecution = (): Readonly<{
	active: ActiveQueryExecution | undefined
	registration: QueryExecutionOwnerRegistration | undefined
}> => {
	const active = activeQueryExecution.getStore()
	const owner = active?.application ?? readActiveApplicationOwner()

	return {
		active,
		registration:
			owner === undefined ? undefined : queryExecutionApplications.get(owner),
	}
}

/** Verifies that an application-bound value belongs to the current owner. */
const requireOwnerRegistration = (
	ownerToken: OperationExecutionOwnerToken,
	options: OperationOptions | undefined,
	subject: 'model' | 'value',
): QueryExecutionOwnerRegistration => {
	normalizeOperationOptions(options)
	const { registration } = resolveOperationExecution()

	if (registration === undefined) {
		throw missingExecutionContext(
			'No initialized active application owns this operation.',
			'No application execution context is available.',
			'operation-owner-missing',
		)
	}

	if (registration.ownerToken !== ownerToken) {
		throw new FrameworkError(
			'VALIDATION_ERROR',
			`Application-bound ${subject} belongs to another application lifecycle.`,
			{ publicMessage: 'The requested schema is not available.' },
		)
	}

	return registration
}

/** @internal Rejects stale application-bound values before any Runtime effect. */
export const assertOperationExecutionOwnerToken = (
	ownerToken: OperationExecutionOwnerToken | undefined,
	options?: OperationOptions,
): void => {
	if (ownerToken !== undefined) {
		requireOwnerRegistration(ownerToken, options, 'value')
	}
}

/** @internal Executes a model mutation through the current verified owner only. */
export const executeActiveModelSchemaMutation = (
	model: object,
	schema: SchemaDefinition,
	ownerToken: OperationExecutionOwnerToken,
	name: string,
	input: unknown,
	options?: OperationOptions,
): Promise<unknown> =>
	requireOwnerRegistration(
		ownerToken,
		options,
		'model',
	).executeModelSchemaMutation(model, schema, name, input, options)

/** Dispatches one class-level plugin method through the selected application only. */
export const executeStaticSchemaMutation = async (
	schema: SchemaDefinition,
	name: string,
	input: unknown,
	options?: OperationOptions,
): Promise<unknown> => {
	normalizeOperationOptions(options)
	const { registration } = resolveOperationExecution()

	if (registration === undefined) throw missingOwner()

	return registration.executeSchemaMutation(schema, name, input, options)
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
		throw missingExecutionContext(
			'The active query executor cannot apply terminal authority options.',
			'No request execution context is available.',
			'operation-authority-unavailable',
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
		throw missingExecutionContext(
			'The active query executor cannot execute atomic operation batches.',
			'No request execution context is available.',
			'operation-batch-unavailable',
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
	const parent = activeQueryExecution.getStore()
	const parentExecutor = (): QueryExecutionDispatcher => {
		if (parent === undefined) {
			throw missingExecutionContext(
				'Hook queries require an active operation engine.',
				'Queries are not available during this hook phase.',
				'hook-query-engine-unavailable',
			)
		}

		return parent.executor
	}
	const executor: QueryExecutionDispatcher = immutableRecord({
		execute: (operation) =>
			guard.run(() => parentExecutor().execute(operation)),
	})

	// Authority resolution and batches stay behind the same revocable hook lease.
	registerOperationExecutionHandler(executor, (operation, options, scope) =>
		guard.run(() =>
			dispatchOperation(parentExecutor(), operation, options, scope),
		),
	)
	registerOperationBatchExecutionHandler(
		executor,
		(entries, options, projection) =>
			guard.run(() =>
				dispatchOperationBatch(parentExecutor(), entries, options, projection),
			),
	)

	return activeQueryExecution.run(
		immutableRecord({ application: parent?.application, executor }),
		callback,
	)
}

const bindExecutionResult = async <TResult>(
	result: Promise<unknown>,
	registration: QueryExecutionOwnerRegistration | undefined,
): Promise<TResult> => {
	const value = await result

	// Runtime binds the erased dispatcher result to the exact requested shape.
	return (registration?.bindResult(value, registration.ownerToken) ??
		value) as TResult
}

/**
 * Runs one dispatch on the active executor, or on a fresh root executor of the
 * ambient application. Selection failures stay synchronous, like dispatch ones.
 */
const executeWithAmbientExecutor = <TResult>(
	dispatch: (executor: QueryExecutionDispatcher) => Promise<unknown>,
	missingReason: string,
): Promise<TResult> => {
	const { active, registration } = resolveOperationExecution()

	if (active !== undefined) {
		return bindExecutionResult(dispatch(active.executor), registration)
	}

	if (registration === undefined) throw missingOwner(missingReason)

	return bindExecutionResult(
		dispatch(registration.createRootExecutor()),
		registration,
	)
}

/** Executes ordered item operations inside one all-or-nothing Runtime transaction. */
export const executeOperationBatch = <
	const TOperation extends OperationAstNode,
>(
	entries: readonly OperationBatchEntry<TOperation>[],
	options: NormalizedOperationOptions,
	projection?: OperationBatchProjection,
): Promise<readonly OperationResult<TOperation>[]> =>
	executeWithAmbientExecutor(
		(executor) =>
			dispatchOperationBatch(executor, entries, options, projection),
		'query-executor-unavailable',
	)

/** Resolves one terminal at call time without retaining execution in its QueryBuilder AST. */
export const executeOperation = <const TOperation extends OperationAstNode>(
	operation: TOperation,
	options: NormalizedOperationOptions,
	scope?: OperationPrivateScope,
): Promise<OperationResult<TOperation>> =>
	executeWithAmbientExecutor(
		(executor) => dispatchOperation(executor, operation, options, scope),
		'operation-owner-missing',
	)
