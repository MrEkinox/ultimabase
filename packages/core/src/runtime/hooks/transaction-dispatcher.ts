import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type {
	HookErrorPhase,
	HookErrorTransactionState,
} from '../../schema/hooks/contracts.js'
import type { HookContext } from '../../schema/hooks/hook-context.js'
import type { RequestContext } from '../context/request-context.js'
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
	FieldHookContributionPlan,
	NativeHookContributionPlan,
	SchemaHookContributionPlan,
} from './contribution-plan.js'
import { collectOperationFieldInputs } from './field-inputs.js'
import { getNativeHookPhaseOrder } from './phase-order.js'
import {
	createFieldHookTarget,
	createSchemaHookTarget,
} from './execution-descriptor.js'
import type { HookExecutionRuntime } from './execution-runtime.js'
import {
	TransactionHookJournal,
	type TransactionHookFailedEntry,
	type TransactionHookJournalEntry,
	type TransactionHookSuccessfulMutationEntry,
} from './transaction-journal.js'

/** Narrows finalized journal entries without relying on open Runtime unions. */
const isMutationEntry = (
	entry: TransactionHookJournalEntry,
): entry is TransactionHookSuccessfulMutationEntry =>
	entry.status === 'succeeded' && entry.category === 'mutation'

const isMutationOperation = (
	entry: TransactionHookJournalEntry,
): entry is TransactionHookJournalEntry & {
	readonly operation: DatabaseMutationOperationAst
} => {
	switch (entry.operation.kind) {
		case 'count':
		case 'exists':
		case 'find':
		case 'first':
		case 'get':
			return false
		case 'create-many':
		case 'create-one':
		case 'delete-many':
		case 'delete-one':
		case 'update-many':
		case 'update-one':
		case 'upsert-many':
		case 'upsert-one':
			return true
	}
}

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

const createSchemaOutcomeInput = (
	entry: TransactionHookSuccessfulMutationEntry,
	context: HookContext,
): Readonly<{
	readonly context: HookContext
	readonly kind: DatabaseMutationOperationAst['kind']
	readonly operation: DatabaseMutationOperationAst
	readonly result: unknown
}> =>
	immutableRecord({
		context,
		kind: entry.operation.kind,
		operation: entry.operation,
		result: entry.result,
	})

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

/** Resolves fields that carried a real value or semantic change for one entry. */
const collectParticipatingFields = (
	plan: NativeHookContributionPlan,
	entry: TransactionHookJournalEntry,
): readonly FieldHookContributionPlan[] => {
	if (!isMutationOperation(entry)) {
		return immutableArray([])
	}

	if (
		entry.operation.kind === 'delete-many' ||
		entry.operation.kind === 'update-many'
	) {
		// Set-based terminals never manufacture per-field participation.
		return immutableArray([])
	}

	const schema = requireDeclaredOperationSchema(entry.operation)
	const paths = isMutationEntry(entry)
		? entry.fieldChanges.map(({ fieldPath }) => fieldPath)
		: collectOperationFieldInputs(entry.operation, 'children-first').map(
				({ fieldPath }) => fieldPath,
			)
	const fields: FieldHookContributionPlan[] = []
	const seenPaths = new Set<string>()

	for (const path of paths) {
		const key = JSON.stringify(path)

		if (seenPaths.has(key)) {
			continue
		}

		seenPaths.add(key)
		const fieldPlan = plan.getField(schema, path)

		if (fieldPlan !== undefined) {
			fields.push(fieldPlan)
		}
	}

	return immutableArray(fields)
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

	for (const entry of entries) {
		if (!isMutationEntry(entry)) {
			continue
		}

		const schema = requireDeclaredOperationSchema(entry.operation)
		const family = getNativeHookPhaseOrder(entry.operation.kind).family

		for (const fieldChange of entry.fieldChanges) {
			const fieldPlan = plan.getField(schema, fieldChange.fieldPath)

			if (fieldPlan === undefined) {
				continue
			}

			const handlers = collectNestedHookHandlers(
				fieldPlan.contributions,
				'after',
				'afterCommit',
				entry.operation.kind,
				createFieldHookTarget(schema.className, fieldChange.fieldPath),
				family,
			)
			failures.push(
				...(await runHookObservers(
					runtime,
					handlers,
					entry.context,
					(context) =>
						immutableRecord({
							context,
							change: fieldChange.change,
							kind: entry.operation.kind,
							timing: 'after-commit' as const,
						}),
				)),
			)
		}

		const schemaPlan = plan.getSchema(schema)

		if (schemaPlan === undefined) {
			throw new TypeError('Native hook plan does not own the operation schema')
		}

		const handlers = collectNestedHookHandlers(
			schemaPlan.contributions,
			'after',
			'afterCommit',
			entry.operation.kind,
			createSchemaHookTarget(schema.className),
			family,
		)
		failures.push(
			...(await runHookObservers(runtime, handlers, entry.context, (context) =>
				createSchemaOutcomeInput(entry, context),
			)),
		)
	}

	throwObserverFailures(failures, 'Multiple after-commit hooks failed.')
}

const runAfterRollback = async (
	plan: NativeHookContributionPlan,
	runtime: HookExecutionRuntime,
	entries: readonly TransactionHookJournalEntry[],
	error: unknown,
): Promise<void> => {
	const failures: unknown[] = []
	const schemaOperations = new Map<
		SchemaHookContributionPlan,
		DatabaseMutationOperationAst[]
	>()

	for (const entry of entries) {
		if (!isMutationOperation(entry)) {
			continue
		}

		const schemaPlan = plan.getSchema(
			requireDeclaredOperationSchema(entry.operation),
		)

		if (schemaPlan === undefined) {
			throw new TypeError('Native hook plan does not own the operation schema')
		}

		const operations = schemaOperations.get(schemaPlan) ?? []

		operations.push(entry.operation)
		schemaOperations.set(schemaPlan, operations)
		const family = getNativeHookPhaseOrder(entry.operation.kind).family

		for (const fieldPlan of collectParticipatingFields(plan, entry)) {
			const handlers = collectNestedHookHandlers(
				fieldPlan.contributions,
				'after',
				'afterRollback',
				entry.operation.kind,
				createFieldHookTarget(schemaPlan.schema.className, fieldPlan.path),
				family,
			)
			failures.push(
				...(await runHookObservers(
					runtime,
					handlers,
					entry.context,
					(context) =>
						immutableRecord({
							context,
							error,
							kind: entry.operation.kind,
							timing: 'after-rollback' as const,
						}),
				)),
			)
		}
	}

	for (const [schemaPlan, operations] of schemaOperations) {
		const firstOperation = operations[0]

		if (firstOperation === undefined) {
			continue
		}

		const request = entries.find(
			(entry) =>
				isMutationOperation(entry) &&
				plan.getSchema(requireDeclaredOperationSchema(entry.operation)) ===
					schemaPlan,
		)?.context

		if (request === undefined) {
			continue
		}

		const handlers = collectNestedHookHandlers(
			schemaPlan.contributions,
			'after',
			'afterRollback',
			firstOperation.kind,
			createSchemaHookTarget(schemaPlan.schema.className),
		)
		failures.push(
			...(await runHookObservers(runtime, handlers, request, (context) =>
				immutableRecord({
					context,
					error,
					operations: immutableArray(operations),
				}),
			)),
		)
	}

	throwObserverFailures(failures, 'Multiple after-rollback hooks failed.')
}

interface ErrorObservation {
	readonly entry: TransactionHookJournalEntry
	readonly error: unknown
	readonly phase: HookErrorPhase
}

const collectErrorObservations = (
	entries: readonly TransactionHookJournalEntry[],
	error: unknown,
	phase: HookErrorPhase,
): readonly ErrorObservation[] => {
	const failed = entries.filter(
		(entry): entry is TransactionHookFailedEntry => entry.status === 'failed',
	)
	const observed = failed.length === 0 ? entries : failed

	return immutableArray(
		observed.map((entry) =>
			immutableRecord({
				entry,
				error: entry.status === 'failed' ? entry.error : error,
				phase: entry.status === 'failed' ? entry.phase : phase,
			}),
		),
	)
}

const runOnError = async (
	plan: NativeHookContributionPlan,
	runtime: HookExecutionRuntime,
	entries: readonly TransactionHookJournalEntry[],
	input: Readonly<{
		readonly error: unknown
		readonly phase: HookErrorPhase
		readonly transaction: HookErrorTransactionState
	}>,
): Promise<void> => {
	const failures: unknown[] = []

	for (const observation of collectErrorObservations(
		entries,
		input.error,
		input.phase,
	)) {
		const { entry } = observation
		const schemaPlan = plan.getSchema(
			requireDeclaredOperationSchema(entry.operation),
		)

		if (schemaPlan === undefined) {
			throw new TypeError('Native hook plan does not own the operation schema')
		}

		const family = getNativeHookPhaseOrder(entry.operation.kind).family
		for (const fieldPlan of collectParticipatingFields(plan, entry)) {
			const fieldHandlers = collectNestedHookHandlers(
				fieldPlan.contributions,
				'after',
				'onError',
				entry.operation.kind,
				createFieldHookTarget(schemaPlan.schema.className, fieldPlan.path),
				family,
			)
			failures.push(
				...(await runHookObservers(
					runtime,
					fieldHandlers,
					entry.context,
					(context) =>
						immutableRecord({
							context,
							error: observation.error,
							kind: entry.operation.kind,
							phase: observation.phase,
							transaction: input.transaction,
						}),
				)),
			)
		}

		const schemaHandlers = collectNestedHookHandlers(
			schemaPlan.contributions,
			'after',
			'onError',
			entry.operation.kind,
			createSchemaHookTarget(schemaPlan.schema.className),
			family,
		)

		failures.push(
			...(await runHookObservers(
				runtime,
				schemaHandlers,
				entry.context,
				(context) =>
					immutableRecord({
						context,
						error: observation.error,
						kind: entry.operation.kind,
						operation: entry.operation,
						phase: observation.phase,
						transaction: input.transaction,
					}),
			)),
		)
	}

	throwObserverFailures(failures, 'Multiple error hooks failed.')
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
		afterRollback: (error) =>
			runAfterRollback(plan, runtime, readEntries(), error),
		beforeCommit: () => runBeforeCommit(plan, runtime, readEntries()),
		onError: (input) => runOnError(plan, runtime, readEntries(), input),
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

/** Executes root read error hooks without manufacturing transaction state. */
export const runNonTransactionalErrorHooks = async (
	plan: NativeHookContributionPlan,
	runtime: HookExecutionRuntime,
	input: Readonly<{
		readonly context: RequestContext
		readonly error: unknown
		readonly operation: TransactionHookJournalEntry['operation']
		readonly phase: HookErrorPhase
		readonly transaction: HookErrorTransactionState
	}>,
): Promise<void> => {
	const failedEntry = immutableRecord({
		context: input.context,
		error: input.error,
		operation: input.operation,
		order: 0,
		phase: input.phase,
		status: 'failed' as const,
	}) satisfies TransactionHookFailedEntry

	await runOnError(plan, runtime, immutableArray([failedEntry]), input)
}
