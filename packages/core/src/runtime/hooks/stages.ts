import {
	FrameworkApplication,
	type PluginContribution,
	type PluginDefinition,
} from '../../foundation.js'
import type { SchemaDefinition } from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type {
	DatabaseOperationAst,
	DatabaseOperationResult,
} from '../database/contracts.js'
import { getOperationSchema } from '../operations/schema.js'
import type {
	RuntimeOperationStageInput,
	RuntimeOperationTransformStage,
	RuntimeResultEffectStage,
	RuntimeResultStageInput,
	RuntimeResultTransformStage,
} from '../pipeline/contracts.js'
import {
	createAfterHookInput,
	createBeforeHookInput,
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

type RuntimeContributionImplementation = NonNullable<
	ReturnType<typeof getRuntimeContributionImplementation>
>

interface OwnedRuntimeContribution {
	readonly contribution: PluginContribution
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
		owner: createPluginHookOwner(contribution.ownerPlugin, contribution.name),
		phase: implementation.kind,
		target:
			implementation.schema === undefined
				? globalHookTarget
				: createSchemaHookTarget(implementation.schema.className),
	})
}

/** Supplies exactly the five hook and event stages owned by the Runtime pipeline. */
export interface RuntimeHookStages {
	readonly globalBeforeHooks: RuntimeOperationTransformStage
	readonly schemaBeforeHooks: RuntimeOperationTransformStage
	readonly schemaAfterHooks: RuntimeResultTransformStage
	readonly globalAfterHooks: RuntimeResultTransformStage
	readonly postCommitEvents: RuntimeResultEffectStage
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

/** Rejects terminal or schema changes that would invalidate pipeline result typing. */
const normalizeBeforeHookOutput = <
	const TOperation extends DatabaseOperationAst,
>(
	previousOperation: TOperation,
	output: unknown,
): TOperation => {
	const result = assertExactHookOutput(output, 'operation')
	const nextOperation: unknown = result.operation

	if (
		!isPlainRecord(nextOperation) ||
		nextOperation.kind !== previousOperation.kind
	) {
		throw new TypeError('before-operation hook must preserve operation kind')
	}

	if (
		getOperationSchema(nextOperation) !== getOperationSchema(previousOperation)
	) {
		throw new TypeError('before-operation hook must preserve schema identity')
	}

	// The discriminant and schema checks retain the exact generic operation contract.
	return immutableRecord(nextOperation) as TOperation
}

const normalizeAfterHookOutput = <
	const TOperation extends DatabaseOperationAst,
>(
	output: unknown,
): DatabaseOperationResult<TOperation> => {
	const result = assertExactHookOutput(output, 'result')

	// Result validation remains operation-specific; this boundary only enforces explicit replacement.
	return result.result as DatabaseOperationResult<TOperation>
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

	for (const contribution of application.getContributions(category)) {
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
): Promise<TOperation> => {
	let operation: TOperation = input.operation

	for (const owned of contributions) {
		const { implementation } = owned
		if (!matchesContribution(implementation, operation)) {
			continue
		}

		const output: unknown = await runtime.invoke(
			createRuntimeContributionDescriptor(owned, operation),
			input.context,
			(context) =>
				implementation.run(createBeforeHookInput(context, operation)),
		)

		operation = normalizeBeforeHookOutput(operation, output)
	}

	return operation
}

const runAfterContributions = async <
	const TOperation extends DatabaseOperationAst,
>(
	contributions: readonly OwnedRuntimeContribution[],
	runtime: HookExecutionRuntime,
	input: RuntimeResultStageInput<TOperation>,
): Promise<DatabaseOperationResult<TOperation>> => {
	let result: DatabaseOperationResult<TOperation> = input.result

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
	})
}
