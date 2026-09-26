import {
	FrameworkApplication,
	type PluginDefinition,
} from '../../foundation.js'
import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import type { SchemaDefinition } from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
} from '../database/contracts.js'
import { getOperationSchema } from '../operations/schema.js'
import type {
	RuntimePreparedMutationStageInput,
	RuntimeBehaviorStages,
	RuntimeOperationResult,
	RuntimeOperationStageInput,
	RuntimeResultStageInput,
} from '../pipeline/contracts.js'
import {
	createAfterContributionInput,
	createBeforeContributionInput,
	createPreparedContributionInput,
	getRuntimeContributionImplementation,
} from './definitions.js'
import {
	createRuntimeCallbackDescriptor,
	getApplicationRuntimeCallbackExecutor,
	type RuntimeCallbackDescriptor,
	type RuntimeCallbackExecutor,
} from './execution.js'
import { runtimeInterceptorCapability } from '../capabilities.js'

type RuntimeContributionImplementation = NonNullable<
	ReturnType<typeof getRuntimeContributionImplementation>
>

interface OwnedRuntimeContribution {
	readonly contribution: Readonly<{
		readonly name: string
		readonly ownerInstanceId?: string
		readonly ownerPlugin: string
		readonly value: unknown
	}>
	readonly implementation: RuntimeContributionImplementation
}

/** Builds one redacted identity without retaining operation inputs or results. */
const createRuntimeContributionDescriptor = (
	owned: OwnedRuntimeContribution,
	operation: DatabaseOperationAst,
): RuntimeCallbackDescriptor => {
	const { contribution, implementation } = owned
	return createRuntimeCallbackDescriptor({
		operationKind: operation.kind,
		owner: {
			contributionId: contribution.name,
			kind: 'plugin',
			pluginId: contribution.ownerPlugin,
			...(contribution.ownerInstanceId === undefined
				? {}
				: { instanceId: contribution.ownerInstanceId }),
		},
		phase: implementation.kind,
		target:
			implementation.schema === undefined
				? { kind: 'global' }
				: { className: implementation.schema.className, kind: 'schema' },
	})
}

const assertExactContributionOutput = (
	output: unknown,
	key: 'operation' | 'result',
): Readonly<Record<string, unknown>> => {
	if (
		!isPlainRecord(output) ||
		!Object.hasOwn(output, key) ||
		Object.keys(output).length !== 1
	) {
		throw new TypeError(`Runtime contribution must return exactly { ${key} }`)
	}

	return output
}

const haveSameKeys = (
	left: Readonly<Record<string, unknown>>,
	right: Readonly<Record<string, unknown>>,
): boolean => {
	const leftKeys = Object.keys(left)
	const rightKeys = Object.keys(right)

	return (
		leftKeys.length === rightKeys.length &&
		leftKeys.every((key) => Object.hasOwn(right, key))
	)
}

/** Restricts the late prepared boundary to values in an existing update shape. */
const normalizePreparedContributionOutput = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	previousOperation: TOperation,
	output: unknown,
): TOperation => {
	const result = assertExactContributionOutput(output, 'operation')

	if (result.operation === previousOperation) return previousOperation

	const candidate: unknown = result.operation

	if (!isPlainRecord(candidate) || candidate.kind !== previousOperation.kind) {
		throw new TypeError(
			'prepared-operation contribution must preserve operation kind',
		)
	}

	if (getOperationSchema(candidate) !== getOperationSchema(previousOperation)) {
		throw new TypeError(
			'prepared-operation contribution must preserve schema identity',
		)
	}

	const nextOperation = immutableRecord(candidate) as TOperation
	const previousValue: unknown = previousOperation
	const nextValue: unknown = nextOperation

	if (!isPlainRecord(previousValue) || !isPlainRecord(nextValue)) {
		throw new TypeError(
			'prepared-operation contribution requires plain operations',
		)
	}

	const previousRecord = previousValue
	const nextRecord = nextValue

	if (!haveSameKeys(previousRecord, nextRecord)) {
		throw new TypeError(
			'prepared-operation contribution may only replace update values',
		)
	}

	for (const key of Object.keys(previousRecord)) {
		if (key !== 'update' && nextRecord[key] !== previousRecord[key]) {
			throw new TypeError(
				'prepared-operation contribution may only replace update values',
			)
		}
	}

	const previousUpdate: unknown = previousRecord.update
	const nextUpdate: unknown = nextRecord.update

	if (
		!isPlainRecord(previousUpdate) ||
		!isPlainRecord(nextUpdate) ||
		previousUpdate.kind !== 'update-expression' ||
		nextUpdate.kind !== 'update-expression' ||
		!isUnknownArray(previousUpdate.operations) ||
		!isUnknownArray(nextUpdate.operations) ||
		!haveSameKeys(previousUpdate, nextUpdate) ||
		previousUpdate.operations.length !== nextUpdate.operations.length
	) {
		throw new TypeError(
			'prepared-operation contribution must preserve the normalized update shape',
		)
	}

	for (const [
		index,
		previousCandidate,
	] of previousUpdate.operations.entries()) {
		const nextCandidate = nextUpdate.operations[index]

		if (
			!isPlainRecord(previousCandidate) ||
			!isPlainRecord(nextCandidate) ||
			!haveSameKeys(previousCandidate, nextCandidate) ||
			previousCandidate.kind !== nextCandidate.kind ||
			previousCandidate.field !== nextCandidate.field
		) {
			throw new TypeError(
				'prepared-operation contribution must preserve every update operation',
			)
		}

		for (const key of Object.keys(previousCandidate)) {
			if (key !== 'value' && nextCandidate[key] !== previousCandidate[key]) {
				throw new TypeError(
					'prepared-operation contribution must preserve every update operation',
				)
			}
		}
	}

	return nextOperation
}

const normalizeAfterContributionOutput = <
	const TOperation extends DatabaseOperationAst,
>(
	output: unknown,
): RuntimeOperationResult<TOperation> => {
	const result = assertExactContributionOutput(output, 'result')

	// Result validation remains operation-specific; this boundary only enforces explicit replacement.
	return result.result as RuntimeOperationResult<TOperation>
}

const matchesContribution = (
	implementation: RuntimeContributionImplementation,
	operation: DatabaseOperationAst,
): boolean =>
	(implementation.operations === undefined ||
		implementation.operations.includes(operation.kind)) &&
	(implementation.schema === undefined ||
		implementation.schema === getOperationSchema(operation))

const readContributions = (
	application: FrameworkApplication<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
): readonly OwnedRuntimeContribution[] => {
	const ownedContributions: OwnedRuntimeContribution[] = []

	const contributions = readApplicationKernelState(application)
		.capabilityContributions(runtimeInterceptorCapability)
		.map(({ contributionId, owner, value }) =>
			immutableRecord({
				name: contributionId,
				ownerPlugin: owner.pluginId,
				...(owner.instanceId === undefined
					? {}
					: { ownerInstanceId: owner.instanceId }),
				value,
			}),
		)

	for (const contribution of contributions) {
		const implementation = getRuntimeContributionImplementation(
			contribution.value,
		)
		// A missing implementation must never silently discard an interceptor.
		if (implementation === undefined) {
			throw new TypeError('Runtime interceptor implementation is unavailable')
		}

		if (
			implementation.schema !== undefined &&
			!application.ownsSchema(implementation.schema)
		) {
			throw new TypeError(
				`Runtime contribution "${contribution.name}" references a schema outside its application`,
			)
		}

		ownedContributions.push(immutableRecord({ contribution, implementation }))
	}

	return immutableArray(ownedContributions)
}

const runBeforeContributions = async <
	const TOperation extends DatabaseOperationAst,
>(
	contributions: readonly OwnedRuntimeContribution[],
	runtime: RuntimeCallbackExecutor,
	input: RuntimeOperationStageInput<TOperation>,
): Promise<void> => {
	for (const owned of contributions) {
		const { implementation } = owned
		if (!matchesContribution(implementation, input.operation)) {
			continue
		}

		const output: unknown = await runtime.invoke(
			createRuntimeContributionDescriptor(owned, input.operation),
			input.context,
			() =>
				implementation.run(
					createBeforeContributionInput(input.context, input.operation),
				),
		)

		if (output !== undefined) {
			throw new TypeError('before-operation contribution must return undefined')
		}
	}
}

const runAfterContributions = async <
	const TOperation extends DatabaseOperationAst,
>(
	contributions: readonly OwnedRuntimeContribution[],
	runtime: RuntimeCallbackExecutor,
	input: RuntimeResultStageInput<TOperation>,
): Promise<RuntimeOperationResult<TOperation>> => {
	let result: RuntimeOperationResult<TOperation> = input.result

	for (const owned of contributions) {
		const { implementation } = owned
		if (!matchesContribution(implementation, input.operation)) {
			continue
		}

		const output: unknown = await runtime.invoke(
			createRuntimeContributionDescriptor(owned, input.operation),
			input.context,
			() =>
				implementation.run(
					createAfterContributionInput(input.context, input.operation, result),
				),
		)

		result = normalizeAfterContributionOutput<TOperation>(output)
	}

	return result
}

/** Runs locked-target transformers only for a materialized singular update. */
const runPreparedContributions = async <
	const TOperation extends DatabaseMutationOperationAst,
>(
	contributions: readonly OwnedRuntimeContribution[],
	runtime: RuntimeCallbackExecutor,
	input: RuntimePreparedMutationStageInput<TOperation>,
): Promise<TOperation> => {
	if (
		input.operation.kind !== 'update-one' ||
		input.target === undefined ||
		input.target === null
	) {
		return input.operation
	}

	const target = input.target
	let operation: TOperation = input.operation

	for (const owned of contributions) {
		const { implementation } = owned

		if (!matchesContribution(implementation, operation)) continue

		const output: unknown = await runtime.invoke(
			createRuntimeContributionDescriptor(owned, operation),
			input.context,
			() =>
				implementation.run(
					createPreparedContributionInput(input.context, operation, target),
				),
		)

		operation = normalizePreparedContributionOutput(operation, output)
	}

	return operation
}

/** Composes low-level Runtime definitions into the generic behavior kernel. */
export const composeRuntimeContributionBehavior = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
>(
	application: FrameworkApplication<TSchemas, TPlugins>,
): RuntimeBehaviorStages | undefined => {
	if (!(application instanceof FrameworkApplication)) {
		throw new TypeError(
			'Runtime contribution composition requires a FrameworkApplication',
		)
	}

	const interceptors = readContributions(application)
	if (interceptors.length === 0) return undefined

	const runtime = getApplicationRuntimeCallbackExecutor(application)
	const globalBefore: OwnedRuntimeContribution[] = [],
		schemaBefore: OwnedRuntimeContribution[] = [],
		schemaAfter: OwnedRuntimeContribution[] = [],
		globalAfter: OwnedRuntimeContribution[] = [],
		prepared: OwnedRuntimeContribution[] = []

	for (const owned of interceptors) {
		const { implementation } = owned
		if (implementation.kind === 'before-operation') {
			const group =
				implementation.schema === undefined ? globalBefore : schemaBefore
			group.push(owned)
			continue
		}
		if (implementation.kind === 'after-operation') {
			const group =
				implementation.schema === undefined ? globalAfter : schemaAfter
			group.push(owned)
			continue
		}
		prepared.push(owned)
	}

	return immutableRecord({
		...(globalBefore.length === 0 && schemaBefore.length === 0
			? {}
			: {
					beforeOperation: async (input) => {
						await runBeforeContributions(globalBefore, runtime, input)
						await runBeforeContributions(schemaBefore, runtime, input)
					},
				}),
		...(schemaAfter.length === 0 && globalAfter.length === 0
			? {}
			: {
					transformResult: async (input) => {
						const schemaResult = await runAfterContributions(
							schemaAfter,
							runtime,
							input,
						)
						return runAfterContributions(globalAfter, runtime, {
							...input,
							result: schemaResult,
						})
					},
				}),
		...(prepared.length === 0
			? {}
			: {
					transformPreparedOperation: (input) =>
						runPreparedContributions(prepared, runtime, input),
				}),
	})
}
