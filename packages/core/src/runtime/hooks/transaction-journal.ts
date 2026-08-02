import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { HookErrorPhase } from '../../schema/index.js'
import { RequestContext } from '../context/request-context.js'
import type {
	DatabaseMutationOperationAst,
	DatabaseMutationMaterializationSource,
	DatabaseMutationOperationKind,
	DatabaseOperationAst,
} from '../database/contracts.js'
import {
	createRuntimeHookBoundaries,
	type RuntimeHookBoundaries,
} from './boundaries.js'
import {
	collectMutationFieldChanges,
	type RuntimeMutationFieldChange,
} from './materializations.js'

const transactionOperationTokenMarker: unique symbol = Symbol(
	'ultimabase.transaction-operation',
)

/** Identifies one journal reservation without exposing mutable journal state. */
export type TransactionHookOperationToken = Readonly<{
	readonly [transactionOperationTokenMarker]: true
}>

interface TransactionHookJournalEntryBase<
	TOperation extends DatabaseOperationAst,
> {
	/** Retains trusted request identity without copying authority state. */
	readonly context: RequestContext
	/** Preserves synchronous reservation order across concurrent completions. */
	readonly order: number
	/** Stores the last deeply snapshotted operation seen by Runtime. */
	readonly operation: TOperation
}

/** Retains one completed read for failure diagnostics without commit effects. */
export interface TransactionHookSuccessfulReadEntry<
	TOperation extends DatabaseOperationAst = DatabaseOperationAst,
> extends TransactionHookJournalEntryBase<TOperation> {
	readonly category: 'read'
	/** Retains heterogeneous exact terminal results behind an internal boundary. */
	readonly result: unknown
	readonly status: 'succeeded'
}

/** Retains only finalization-safe mutation data, never adapter materializations. */
export interface TransactionHookSuccessfulMutationEntry<
	TOperation extends DatabaseMutationOperationAst =
		DatabaseMutationOperationAst,
> extends TransactionHookJournalEntryBase<TOperation> {
	readonly category: 'mutation'
	readonly fieldChanges: readonly RuntimeMutationFieldChange[]
	/** Retains heterogeneous exact terminal results behind an internal boundary. */
	readonly result: unknown
	readonly status: 'succeeded'
}

/** Retains one operation failure until its final rollback state is known. */
export interface TransactionHookFailedEntry<
	TOperation extends DatabaseOperationAst = DatabaseOperationAst,
> extends TransactionHookJournalEntryBase<TOperation> {
	readonly error: unknown
	readonly phase: HookErrorPhase
	readonly status: 'failed'
}

/** Lists finalized operation observations in deterministic transaction order. */
export type TransactionHookJournalEntry =
	| TransactionHookSuccessfulReadEntry
	| TransactionHookSuccessfulMutationEntry
	| TransactionHookFailedEntry

interface PendingTransactionHookJournalEntry {
	readonly context: RequestContext
	readonly order: number
	readonly status: 'pending'
}

type MutableJournalSlot =
	PendingTransactionHookJournalEntry | TransactionHookJournalEntry

const mutationKinds = new Set<DatabaseMutationOperationKind>([
	'create-many',
	'create-one',
	'delete-many',
	'delete-one',
	'update-many',
	'update-one',
	'upsert-many',
	'upsert-one',
])

const isMutationOperation = (
	operation: DatabaseOperationAst,
): operation is DatabaseMutationOperationAst =>
	mutationKinds.has(operation.kind as DatabaseMutationOperationKind)

const createToken = (): TransactionHookOperationToken =>
	// The private symbol exists only at type level; journal ownership is enforced by identity.
	Object.freeze({}) as TransactionHookOperationToken

/**
 * Records operation-local finalization data for exactly one outer transaction.
 *
 * Reservations are synchronous, so nested or concurrently completed operations
 * retain the order in which Runtime admitted them into the transaction.
 */
export class TransactionHookJournal {
	readonly #boundaries: RuntimeHookBoundaries
	readonly #slots: MutableJournalSlot[] = []
	readonly #slotByToken = new WeakMap<object, number>()

	constructor(
		boundaries: RuntimeHookBoundaries = createRuntimeHookBoundaries(),
	) {
		this.#boundaries = boundaries

		// The public shell is immutable while private journal state remains isolated.
		Object.freeze(this)
	}

	/** Reserves deterministic order before any asynchronous pipeline stage starts. */
	reserve(context: RequestContext): TransactionHookOperationToken {
		if (!(context instanceof RequestContext)) {
			throw new TypeError(
				'Transaction hook journal context must be a RequestContext',
			)
		}

		const token = createToken()
		const order = this.#slots.length

		this.#slots.push(
			immutableRecord({
				context,
				order,
				status: 'pending',
			}),
		)
		this.#slotByToken.set(token, order)

		return token
	}

	/** Finalizes a read or derives one mutation's semantic changes exactly once. */
	succeed(
		token: TransactionHookOperationToken,
		operation: DatabaseOperationAst,
		result: unknown,
		outcome?: DatabaseMutationMaterializationSource,
	): void {
		const pending = this.#requirePending(token)
		const finalOperation = this.#boundaries.snapshotValue(operation)
		const finalResult: unknown = this.#boundaries.snapshotResultReplacement(
			finalOperation,
			result,
		)
		if (isMutationOperation(finalOperation)) {
			if (outcome === undefined) {
				throw new TypeError(
					'Transaction hook journal mutations require a database outcome',
				)
			}

			// Native field dispatch already validated the adapter outcome. Snapshot only
			// the derived changes so the journal never rebuilds full materializations.
			const fieldChanges = this.#boundaries.snapshotValue(
				collectMutationFieldChanges(finalOperation, outcome),
			)

			// Only the public result and semantic changes survive this synchronous scope.
			this.#slots[pending.order] = immutableRecord({
				category: 'mutation',
				context: pending.context,
				fieldChanges,
				operation: finalOperation,
				order: pending.order,
				result: finalResult,
				status: 'succeeded',
			})
		} else {
			if (outcome !== undefined) {
				throw new TypeError(
					'Transaction hook journal reads cannot retain a mutation outcome',
				)
			}

			this.#slots[pending.order] = immutableRecord({
				category: 'read',
				context: pending.context,
				operation: finalOperation,
				order: pending.order,
				result: finalResult,
				status: 'succeeded',
			})
		}

		this.#slotByToken.delete(token)
	}

	/** Finalizes one failed operation while preserving its original error identity. */
	fail(
		token: TransactionHookOperationToken,
		operation: DatabaseOperationAst,
		error: unknown,
		phase: HookErrorPhase,
	): void {
		const pending = this.#requirePending(token)
		const finalOperation = this.#boundaries.snapshotValue(operation)

		this.#slots[pending.order] = immutableRecord({
			context: pending.context,
			error,
			operation: finalOperation,
			order: pending.order,
			phase,
			status: 'failed',
		})
		this.#slotByToken.delete(token)
	}

	/** Returns one immutable finalized snapshot or rejects premature finalization. */
	snapshot(): readonly TransactionHookJournalEntry[] {
		const finalized: TransactionHookJournalEntry[] = []

		for (const slot of this.#slots) {
			if (slot.status === 'pending') {
				throw new TypeError(
					'Transaction hook journal cannot snapshot pending operations',
				)
			}

			finalized.push(slot)
		}

		return immutableArray(finalized)
	}

	#requirePending(
		token: TransactionHookOperationToken,
	): PendingTransactionHookJournalEntry {
		const order = this.#slotByToken.get(token)

		if (order === undefined) {
			throw new TypeError(
				'Transaction hook operation token is foreign or already finalized',
			)
		}

		const slot = this.#slots[order]

		if (slot?.status !== 'pending') {
			throw new TypeError(
				'Transaction hook journal reservation is inconsistent',
			)
		}

		return slot
	}
}
