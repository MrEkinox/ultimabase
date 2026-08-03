import type {
	DatabaseAdapter,
	DatabaseCreateMaterialization,
	DatabaseDeleteMaterialization,
	DatabaseLogicalRecord,
	DatabaseMutationMaterialization,
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationOutcome,
	DatabaseOperationRequest,
	DatabaseOperationResult,
	DatabaseTransactionAdapter,
	DatabaseUpdateMaterialization,
	PreparedDatabaseOperation,
	RuntimePipelineStages,
} from '../../../src/runtime/index.js'
import {
	databasePointerCapability,
	RuntimePipeline,
} from '../../../src/runtime/index.js'
import { immutableArray, immutableRecord } from '@ultimabase/shared'

type QueuedMutationMaterialization =
	| DatabaseCreateMaterialization
	| DatabaseDeleteMaterialization
	| DatabaseUpdateMaterialization

/** Supplies optional mutation-only snapshots without changing existing result fixtures. */
export interface AdapterMutationFixture {
	readonly target?: DatabaseLogicalRecord | null
	readonly materializations?: readonly QueuedMutationMaterialization[]
}

/** Configures one reusable single-use handle without coupling tests to a queue. */
export interface PreparedOperationFixtureOptions<
	TOperation extends DatabaseMutationOperationAst,
> {
	readonly target?: DatabaseLogicalRecord | null
	readonly execute: () => Promise<DatabaseOperationResult<TOperation>>
	readonly materializations?: readonly DatabaseMutationMaterialization<TOperation>[]
	readonly onExecute?: () => void
}

export interface FulfilledAdapterResult extends AdapterMutationFixture {
	readonly status: 'fulfilled'
	readonly value: unknown
}

export interface RejectedAdapterResult extends AdapterMutationFixture {
	readonly status: 'rejected'
	readonly error: Error
}

export type QueuedAdapterResult = FulfilledAdapterResult | RejectedAdapterResult

export interface TransactionFailureOptions {
	readonly commit?: Error
	readonly rollback?: Error
}

/** Allows focused transaction tests to replace only effectful pipeline stages. */
export type RecordingPipelineHookStages = Partial<
	Pick<
		RuntimePipelineStages,
		| 'globalBeforeHooks'
		| 'schemaBeforeHooks'
		| 'schemaAfterHooks'
		| 'globalAfterHooks'
	>
>

/** Removes exactly one result so prepare and execute cannot consume different fixtures. */
const takeQueuedResult = (
	results: QueuedAdapterResult[],
): Promise<QueuedAdapterResult> => {
	const result: QueuedAdapterResult | undefined = results.shift()

	if (result === undefined) {
		return Promise.reject(new Error('Missing adapter fixture result'))
	}

	return Promise.resolve(result)
}

/** Resolves fixture values only at the operation boundary that supplies their exact type. */
const resolveQueuedResult = async <
	const TOperation extends DatabaseOperationAst,
>(
	result: QueuedAdapterResult,
): Promise<DatabaseOperationResult<TOperation>> => {
	if (result.status === 'rejected') {
		throw result.error
	}

	// Awaiting lets transaction tests deliberately control an in-flight fixture.
	return (await result.value) as DatabaseOperationResult<TOperation>
}

/** Builds one immutable handle that consumes both successful and failed attempts. */
export const createPreparedOperationFixture = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	options: PreparedOperationFixtureOptions<TOperation>,
): PreparedDatabaseOperation<TOperation> => {
	let attempted = false
	const execute = async (): Promise<DatabaseOperationOutcome<TOperation>> => {
		if (attempted) {
			throw new TypeError('Prepared database operation is already executed')
		}

		// A failed attempt consumes the retained target just like a successful write.
		attempted = true
		options.onExecute?.()

		const outcome = immutableRecord({
			materializations: immutableArray(options.materializations ?? []),
			result: await options.execute(),
		})

		// The fixture queue is intentionally operation-erased until this boundary.
		return outcome as unknown as DatabaseOperationOutcome<TOperation>
	}

	const prepared = immutableRecord({
		...(options.target === undefined ? {} : { target: options.target }),
		execute,
	})

	return prepared as unknown as PreparedDatabaseOperation<TOperation>
}

/** Models one plugin-owned transaction and records every lifecycle boundary. */
export class RecordingTransactionAdapter implements DatabaseTransactionAdapter {
	readonly kind = 'database-transaction-adapter' as const
	readonly capabilities = immutableRecord({
		pointers: databasePointerCapability,
	})
	readonly requests: DatabaseOperationRequest[] = []
	readonly #results: QueuedAdapterResult[]
	readonly #trace: string[]
	readonly #failures: TransactionFailureOptions

	constructor(
		results: QueuedAdapterResult[],
		trace: string[],
		failures: TransactionFailureOptions = {},
	) {
		// Every transaction consumes the adapter's one ordered response queue.
		this.#results = results
		this.#trace = trace
		this.#failures = failures
	}

	async execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.requests.push(request)
		this.#trace.push(`execute:${request.operation.kind}`)

		return resolveQueuedResult<TOperation>(
			await takeQueuedResult(this.#results),
		)
	}

	async prepare<const TOperation extends DatabaseMutationOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<PreparedDatabaseOperation<TOperation>> {
		this.requests.push(request)
		this.#trace.push(`prepare:${request.operation.kind}`)
		const result: QueuedAdapterResult = await takeQueuedResult(this.#results)

		return createPreparedOperationFixture({
			...(result.target === undefined ? {} : { target: result.target }),
			execute: () => resolveQueuedResult<TOperation>(result),
			materializations: (result.materializations ??
				[]) as readonly DatabaseMutationMaterialization<TOperation>[],
			onExecute: () => {
				this.#trace.push(`execute:${request.operation.kind}`)
			},
		})
	}

	commit(): Promise<void> {
		this.#trace.push('adapter:commit')

		return this.#failures.commit === undefined
			? Promise.resolve()
			: Promise.reject(this.#failures.commit)
	}

	rollback(): Promise<void> {
		this.#trace.push('adapter:rollback')

		return this.#failures.rollback === undefined
			? Promise.resolve()
			: Promise.reject(this.#failures.rollback)
	}
}

/** Starts fresh transaction adapters while retaining root read execution. */
export class RecordingDatabaseAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
	readonly capabilities = immutableRecord({
		pointers: databasePointerCapability,
	})
	readonly rootRequests: DatabaseOperationRequest[] = []
	readonly transactions: RecordingTransactionAdapter[] = []
	readonly #results: QueuedAdapterResult[]
	readonly #trace: string[]
	readonly #failures: TransactionFailureOptions

	constructor(
		results: readonly QueuedAdapterResult[],
		trace: string[],
		failures: TransactionFailureOptions = {},
	) {
		this.#results = [...results]
		this.#trace = trace
		this.#failures = failures
	}

	async execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.rootRequests.push(request)
		this.#trace.push(`execute:${request.operation.kind}`)

		return resolveQueuedResult<TOperation>(
			await takeQueuedResult(this.#results),
		)
	}

	beginTransaction(): Promise<RecordingTransactionAdapter> {
		this.#trace.push('adapter:begin')

		const transaction = new RecordingTransactionAdapter(
			this.#results,
			this.#trace,
			this.#failures,
		)

		this.transactions.push(transaction)

		return Promise.resolve(transaction)
	}
}

/** Creates the real pipeline without manufacturing absent policy capabilities. */
export const createRecordingPipeline = (
	databaseOperation: DatabaseAdapter,
	trace: string[],
	hookStages: RecordingPipelineHookStages = {},
): RuntimePipeline => {
	const stages: RuntimePipelineStages = {
		normalization: (input) => input.operation,
		structuralValidation: (input) => input.operation,
		globalBeforeHooks: (input) => input.operation,
		schemaBeforeHooks: (input) => input.operation,
		databaseOperation,
		schemaAfterHooks: (input) => input.result,
		globalAfterHooks: (input) => input.result,
		...hookStages,
		commit: (input) => {
			trace.push(`pipeline:commit:${input.operation.kind}`)
		},
		postCommitEvents: (input) => {
			trace.push(`event:${input.operation.kind}`)
		},
	}

	return new RuntimePipeline(stages)
}
