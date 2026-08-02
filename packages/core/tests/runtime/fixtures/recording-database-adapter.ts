import type {
	DatabaseAdapter,
	DatabaseOperationAst,
	DatabaseOperationRequest,
	DatabaseOperationResult,
	DatabaseTransactionAdapter,
	RuntimePipelineStages,
} from '../../../src/runtime/index.js'
import { RuntimePipeline } from '../../../src/runtime/index.js'

export interface FulfilledAdapterResult {
	readonly status: 'fulfilled'
	readonly value: unknown
}

export interface RejectedAdapterResult {
	readonly status: 'rejected'
	readonly error: Error
}

export type QueuedAdapterResult = FulfilledAdapterResult | RejectedAdapterResult

export interface TransactionFailureOptions {
	readonly commit?: Error
	readonly rollback?: Error
}

/** Resolves fixture values only at the operation boundary that supplies their exact type. */
const executeQueuedResult = <const TOperation extends DatabaseOperationAst>(
	results: QueuedAdapterResult[],
): Promise<DatabaseOperationResult<TOperation>> => {
	const result: QueuedAdapterResult | undefined = results.shift()

	if (result === undefined) {
		return Promise.reject(new Error('Missing adapter fixture result'))
	}

	if (result.status === 'rejected') {
		return Promise.reject(result.error)
	}

	return Promise.resolve(result.value as DatabaseOperationResult<TOperation>)
}

/** Models one plugin-owned transaction and records every lifecycle boundary. */
export class RecordingTransactionAdapter implements DatabaseTransactionAdapter {
	readonly kind = 'database-transaction-adapter' as const
	readonly requests: DatabaseOperationRequest[] = []
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

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.requests.push(request)
		this.#trace.push(`execute:${request.operation.kind}`)

		return executeQueuedResult<TOperation>(this.#results)
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

/** Starts a fresh transaction adapter and can also serve explicit non-atomic writes. */
export class RecordingDatabaseAdapter implements DatabaseAdapter {
	readonly kind = 'database-adapter' as const
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

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.rootRequests.push(request)
		this.#trace.push(`execute:${request.operation.kind}`)

		return executeQueuedResult<TOperation>(this.#results)
	}

	beginTransaction(): Promise<DatabaseTransactionAdapter> {
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

/** Creates the real pipeline while leaving unrelated capabilities neutral. */
export const createRecordingPipeline = (
	databaseOperation: DatabaseAdapter,
	trace: string[],
): RuntimePipeline => {
	const stages: RuntimePipelineStages = {
		normalization: (input) => input.operation,
		structuralValidation: (input) => input.operation,
		clp: () => undefined,
		acl: (input) => input.accessConstraints,
		fieldPermissions: (input) => ({
			operation: input.operation,
			accessConstraints: input.accessConstraints,
		}),
		globalBeforeHooks: (input) => input.operation,
		schemaBeforeHooks: (input) => input.operation,
		databaseOperation,
		schemaAfterHooks: (input) => input.result,
		globalAfterHooks: (input) => input.result,
		commit: (input) => {
			trace.push(`pipeline:commit:${input.operation.kind}`)
		},
		postCommitEvents: (input) => {
			trace.push(`event:${input.operation.kind}`)
		},
	}

	return new RuntimePipeline(stages)
}
