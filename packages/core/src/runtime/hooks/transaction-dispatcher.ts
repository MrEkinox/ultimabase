import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { DatabaseMutationOperationAst } from '../database/contracts.js'
import type {
	RuntimeNativeTransactionLifecycle,
	RuntimeNativeTransactionOperation,
} from '../pipeline/contracts.js'
import { runHookEffects } from './composition.js'
import {
	collectNestedHookHandlers,
	invokeErasedHook,
	requireDeclaredOperationSchema,
	runHookObservers,
} from './contribution-execution.js'
import type {
	NativeHookContributionPlan,
	SchemaHookContributionPlan,
} from './contribution-plan.js'
import { createSchemaHookTarget } from './execution-descriptor.js'
import type { HookExecutionRuntime } from './execution-runtime.js'
import {
	TransactionHookJournal,
	type TransactionHookJournalEntry,
	type TransactionHookSuccessfulMutationEntry,
} from './transaction-journal.js'

/** Narrows finalized journal entries without relying on open Runtime unions. */
const isMutationEntry = (
	entry: TransactionHookJournalEntry,
): entry is TransactionHookSuccessfulMutationEntry =>
	entry.status === 'succeeded' && entry.category === 'mutation'

/** Throws one stable aggregate only when multiple finalization observers fail. */
const throwObserverFailures = (
	failures: readonly unknown[],
	message: string,
): void => {
	if (failures.length === 0) {
		return
	}

	const firstFailure = failures[0]

	if (failures.length === 1) {
		throw firstFailure
	}

	throw new AggregateError(failures, message, { cause: firstFailure })
}

/** Keeps before-commit changes independent from the surrounding hook context. */
const createSchemaCommitChange = (
	entry: TransactionHookSuccessfulMutationEntry,
): Readonly<{
	readonly kind: DatabaseMutationOperationAst['kind']
	readonly operation: DatabaseMutationOperationAst
	readonly result: unknown
}> =>
	immutableRecord({
		kind: entry.operation.kind,
		operation: entry.operation,
		result: entry.result,
	})

/** Groups successful mutations by exact schema while retaining first-use order. */
const groupSuccessfulMutations = (
	plan: NativeHookContributionPlan,
	entries: readonly TransactionHookJournalEntry[],
): ReadonlyMap<
	SchemaHookContributionPlan,
	readonly TransactionHookSuccessfulMutationEntry[]
> => {
	const mutableGroups = new Map<
		SchemaHookContributionPlan,
		TransactionHookSuccessfulMutationEntry[]
	>()

	for (const entry of entries) {
		if (!isMutationEntry(entry)) {
			continue
		}

		const schemaPlan = plan.getSchema(
			requireDeclaredOperationSchema(entry.operation),
		)

		if (schemaPlan === undefined) {
			throw new TypeError('Native hook plan does not own the operation schema')
		}

		const group = mutableGroups.get(schemaPlan) ?? []

		group.push(entry)
		mutableGroups.set(schemaPlan, group)
	}

	const groups = new Map<
		SchemaHookContributionPlan,
		readonly TransactionHookSuccessfulMutationEntry[]
	>()

	for (const [schemaPlan, entriesForSchema] of mutableGroups) {
		groups.set(schemaPlan, immutableArray(entriesForSchema))
	}

	return groups
}

const runBeforeCommit = async (
	plan: NativeHookContributionPlan,
	runtime: HookExecutionRuntime,
	entries: readonly TransactionHookJournalEntry[],
): Promise<void> => {
	for (const [schemaPlan, schemaEntries] of groupSuccessfulMutations(
		plan,
		entries,
	)) {
		const firstEntry = schemaEntries[0]

		if (firstEntry === undefined) {
			continue
		}

		const handlers = collectNestedHookHandlers(
			schemaPlan.contributions,
			'before',
			'beforeCommit',
			firstEntry.operation.kind,
			createSchemaHookTarget(schemaPlan.schema.className),
		)
		const changes = immutableArray(schemaEntries.map(createSchemaCommitChange))
		const request = firstEntry.context

		await runHookEffects(handlers, async (handler) => {
			await invokeErasedHook(runtime, handler, request, (context) =>
				immutableRecord({ changes, context }),
			)
		})
	}
}

const runAfterCommit = async (
	plan: NativeHookContributionPlan,
	runtime: HookExecutionRuntime,
	entries: readonly TransactionHookJournalEntry[],
): Promise<void> => {
	const failures: unknown[] = []

	for (const [schemaPlan, schemaEntries] of groupSuccessfulMutations(
		plan,
		entries,
	)) {
		const firstEntry = schemaEntries[0]

		if (firstEntry === undefined) {
			continue
		}

		const handlers = collectNestedHookHandlers(
			schemaPlan.contributions,
			'after',
			'afterCommit',
			firstEntry.operation.kind,
			createSchemaHookTarget(schemaPlan.schema.className),
		)
		const changes = immutableArray(schemaEntries.map(createSchemaCommitChange))
		failures.push(
			...(await runHookObservers(
				runtime,
				handlers,
				firstEntry.context,
				(context) => immutableRecord({ changes, context }),
			)),
		)
	}

	throwObserverFailures(failures, 'Multiple after-commit hooks failed.')
}

/** Creates isolated finalization behavior from one already compiled hook plan. */
export const createTransactionHookLifecycle = (
	plan: NativeHookContributionPlan,
	runtime: HookExecutionRuntime,
): RuntimeNativeTransactionLifecycle => {
	const journal = new TransactionHookJournal()
	const readEntries = (): readonly TransactionHookJournalEntry[] =>
		journal.snapshot()

	return immutableRecord({
		afterCommit: () => runAfterCommit(plan, runtime, readEntries()),
		// Rollback and error reporting remain Runtime concerns, not schema hooks.
		afterRollback: () => Promise.resolve(),
		beforeCommit: () => runBeforeCommit(plan, runtime, readEntries()),
		onError: () => Promise.resolve(),
		start: ({ context }): RuntimeNativeTransactionOperation => {
			const token = journal.reserve(context)

			return immutableRecord({
				fail: (finalOperation, error, phase) => {
					journal.fail(token, finalOperation, error, phase)
				},
				succeed: (finalOperation, result, outcome) => {
					journal.succeed(token, finalOperation, result, outcome)
				},
			})
		},
	})
}
