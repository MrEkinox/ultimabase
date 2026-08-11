import {
	FrameworkApplication,
	type PluginDefinition,
} from '../../foundation.js'
import {
	readApplicationEventContributions,
	readApplicationRuntimeContributions,
	type OwnedPluginContribution,
} from '../../plugins/setup-registries.js'
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
	RuntimePreparedMutationTransformStage,
	RuntimeOperationGuardStage,
	RuntimeOperationResult,
	RuntimeOperationStageInput,
	RuntimeResultEffectStage,
	RuntimeResultStageInput,
	RuntimeResultTransformStage,
} from '../pipeline/contracts.js'
import {
	createAfterHookInput,
	createBeforeHookInput,
	createPreparedHookInput,
	getRuntimeContributionImplementation,
} from './definitions.js'
import { isPluginHookTargetDefinition } from '../../plugins/hook-targets.js'
import { getEnforcementContributionImplementation } from '../enforcement/definitions.js'
import {
	createHookExecutionDescriptor,
	createPluginHookOwner,
	globalHookTarget,
	createSchemaHookTarget,
} from './execution-descriptor.js'
import type { HookExecutionDescriptor } from './execution-descriptor.js'
import { getApplicationHookExecutionRuntime } from './execution-runtime.js'
import type { HookExecutionRuntime } from './execution-runtime.js'
import { getHookEventImplementation } from './events.js'

type RuntimeContributionImplementation = NonNullable<
	ReturnType<typeof getRuntimeContributionImplementation>
>

interface OwnedRuntimeContribution {
	readonly contribution: OwnedPluginContribution
	readonly implementation: RuntimeContributionImplementation
}

/** Builds one redacted identity without retaining operation inputs or results. */
const createRuntimeContributionDescriptor = (
	owned: OwnedRuntimeContribution,
	operation: DatabaseOperationAst,
): HookExecutionDescriptor => {
	const { contribution, implementation } = owned
	return createHookExecutionDescriptor({
		handler: (input) => implementation.run(input),
		handlerIndex: 0,
		operationKind: operation.kind,
		owner: createPluginHookOwner(
			contribution.ownerPlugin,
			contribution.name,
			contribution.ownerInstanceId,
		),
		phase: implementation.kind,
		target:
			implementation.schema === undefined
				? globalHookTarget
				: createSchemaHookTarget(implementation.schema.className),
	})
}

/** Supplies exactly the five hook and event stages owned by the Runtime pipeline. */
export interface RuntimeHookStages {
	readonly globalBeforeHooks: RuntimeOperationGuardStage
	readonly schemaBeforeHooks: RuntimeOperationGuardStage
	readonly schemaAfterHooks: RuntimeResultTransformStage
	readonly globalAfterHooks: RuntimeResultTransformStage
	readonly postCommitEvents: RuntimeResultEffectStage
	readonly preparedOperationHooks: RuntimePreparedMutationTransformStage
}

const assertExactHookOutput = (
	output: unknown,
	key: 'operation' | 'result',
): Readonly<Record<string, unknown>> => {
	if (
		!isPlainRecord(output) ||
		!Object.hasOwn(output, key) ||
		Object.keys(output).length !== 1
	) {
		throw new TypeError(`runtime hook must return exactly { ${key} }`)
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
const normalizePreparedHookOutput = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	previousOperation: TOperation,
	output: unknown,
): TOperation => {
	const result = assertExactHookOutput(output, 'operation')

	if (result.operation === previousOperation) return previousOperation

	const candidate: unknown = result.operation

	if (!isPlainRecord(candidate) || candidate.kind !== previousOperation.kind) {
		throw new TypeError('prepared-operation hook must preserve operation kind')
	}

	if (getOperationSchema(candidate) !== getOperationSchema(previousOperation)) {
		throw new TypeError('prepared-operation hook must preserve schema identity')
	}

	const nextOperation = immutableRecord(candidate) as TOperation
	const previousValue: unknown = previousOperation
	const nextValue: unknown = nextOperation

	if (!isPlainRecord(previousValue) || !isPlainRecord(nextValue)) {
		throw new TypeError('prepared-operation hook requires plain operations')
	}

	const previousRecord = previousValue
	const nextRecord = nextValue

	if (!haveSameKeys(previousRecord, nextRecord)) {
		throw new TypeError(
			'prepared-operation hook may only replace update values',
		)
	}

	for (const key of Object.keys(previousRecord)) {
		if (key !== 'update' && nextRecord[key] !== previousRecord[key]) {
			throw new TypeError(
				'prepared-operation hook may only replace update values',
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
			'prepared-operation hook must preserve the normalized update shape',
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
				'prepared-operation hook must preserve every update operation',
			)
		}

		for (const key of Object.keys(previousCandidate)) {
			if (key !== 'value' && nextCandidate[key] !== previousCandidate[key]) {
				throw new TypeError(
					'prepared-operation hook must preserve every update operation',
				)
			}
		}
	}

	return nextOperation
}

const normalizeAfterHookOutput = <
	const TOperation extends DatabaseOperationAst,
>(
	output: unknown,
): RuntimeOperationResult<TOperation> => {
	const result = assertExactHookOutput(output, 'result')

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
	category: 'events' | 'hooks',
): readonly OwnedRuntimeContribution[] => {
	const ownedContributions: OwnedRuntimeContribution[] = []

	const contributions =
		category === 'events'
			? readApplicationEventContributions(application)
			: readApplicationRuntimeContributions(application)

	for (const contribution of contributions) {
		if (
			category === 'events' &&
			getHookEventImplementation(contribution.value) !== undefined
		) {
			// Named HookContext events have a dedicated post-commit dispatcher.
			continue
		}

		// Native targets and monotonic enforcement use dedicated dispatchers.
		if (
			category === 'hooks' &&
			(isPluginHookTargetDefinition(contribution.value) ||
				getEnforcementContributionImplementation(contribution.value) !==
					undefined)
		) {
			continue
		}

		const implementation = getRuntimeContributionImplementation(
			contribution.value,
		)

		if (implementation === undefined) {
			throw new TypeError(
				`Plugin "${contribution.ownerPlugin}" registered invalid runtime ${category} contribution "${contribution.name}"`,
			)
		}

		if (
			(category === 'hooks' && implementation.kind === 'post-commit-event') ||
			(category === 'events' && implementation.kind !== 'post-commit-event')
		) {
			throw new TypeError(
				`Runtime contribution "${contribution.name}" uses the wrong registry`,
			)
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
	runtime: HookExecutionRuntime,
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
			(context) =>
				implementation.run(createBeforeHookInput(context, input.operation)),
		)

		if (output !== undefined) {
			throw new TypeError('before-operation hook must return undefined')
		}
	}
}

const runAfterContributions = async <
	const TOperation extends DatabaseOperationAst,
>(
	contributions: readonly OwnedRuntimeContribution[],
	runtime: HookExecutionRuntime,
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
			(context) =>
				implementation.run(
					createAfterHookInput(context, input.operation, result),
				),
		)

		result = normalizeAfterHookOutput<TOperation>(output)
	}

	return result
}

/** Runs locked-target transformers only for a materialized singular update. */
const runPreparedContributions = async <
	const TOperation extends DatabaseMutationOperationAst,
>(
	contributions: readonly OwnedRuntimeContribution[],
	runtime: HookExecutionRuntime,
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
			(context) =>
				implementation.run(createPreparedHookInput(context, operation, target)),
		)

		operation = normalizePreparedHookOutput(operation, output)
	}

	return operation
}

const runPostCommitContributions = async <
	const TOperation extends DatabaseOperationAst,
>(
	contributions: readonly OwnedRuntimeContribution[],
	runtime: HookExecutionRuntime,
	input: RuntimeResultStageInput<TOperation>,
): Promise<void> => {
	for (const owned of contributions) {
		const { implementation } = owned
		if (matchesContribution(implementation, input.operation)) {
			await runtime.invoke(
				createRuntimeContributionDescriptor(owned, input.operation),
				input.context,
				(context) =>
					implementation.run(
						createAfterHookInput(context, input.operation, input.result),
					),
				{ cancellable: false },
			)
		}
	}
}

/** Composes application-owned plugin declarations into deterministic pipeline stages. */
export const createRuntimeHookStages = <
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
>(
	application: FrameworkApplication<TSchemas, TPlugins>,
): RuntimeHookStages => {
	if (!(application instanceof FrameworkApplication)) {
		throw new TypeError('Runtime hook stages require a FrameworkApplication')
	}

	const hooks = readContributions(application, 'hooks')
	const events = readContributions(application, 'events')
	const runtime = getApplicationHookExecutionRuntime(application)
	const globalBefore = immutableArray(
		hooks.filter(
			({ implementation }) =>
				implementation.kind === 'before-operation' &&
				implementation.schema === undefined,
		),
	)
	const schemaBefore = immutableArray(
		hooks.filter(
			({ implementation }) =>
				implementation.kind === 'before-operation' &&
				implementation.schema !== undefined,
		),
	)
	const schemaAfter = immutableArray(
		hooks.filter(
			({ implementation }) =>
				implementation.kind === 'after-operation' &&
				implementation.schema !== undefined,
		),
	)
	const globalAfter = immutableArray(
		hooks.filter(
			({ implementation }) =>
				implementation.kind === 'after-operation' &&
				implementation.schema === undefined,
		),
	)
	const prepared = immutableArray(
		hooks.filter(
			({ implementation }) => implementation.kind === 'prepared-operation',
		),
	)

	return immutableRecord({
		globalBeforeHooks: (input) =>
			runBeforeContributions(globalBefore, runtime, input),
		schemaBeforeHooks: (input) =>
			runBeforeContributions(schemaBefore, runtime, input),
		schemaAfterHooks: (input) =>
			runAfterContributions(schemaAfter, runtime, input),
		globalAfterHooks: (input) =>
			runAfterContributions(globalAfter, runtime, input),
		postCommitEvents: (input) =>
			runPostCommitContributions(events, runtime, input),
		preparedOperationHooks: (input) =>
			runPreparedContributions(prepared, runtime, input),
	})
}
