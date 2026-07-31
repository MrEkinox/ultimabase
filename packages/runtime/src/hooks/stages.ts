import {
	FrameworkApplication,
	type PluginContribution,
	type PluginDefinition,
} from '@ultimabase/core'
import type { SchemaDefinition } from '@ultimabase/schema'
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

type RuntimeContributionImplementation = NonNullable<
	ReturnType<typeof getRuntimeContributionImplementation>
>

interface OwnedRuntimeContribution {
	readonly contribution: PluginContribution
	readonly implementation: RuntimeContributionImplementation
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
): readonly OwnedRuntimeContribution[] =>
	immutableArray(
		application.getContributions(category).map((contribution) => {
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

			return immutableRecord({ contribution, implementation })
		}),
	)

const runBeforeContributions = async <
	const TOperation extends DatabaseOperationAst,
>(
	contributions: readonly OwnedRuntimeContribution[],
	input: RuntimeOperationStageInput<TOperation>,
): Promise<TOperation> => {
	let operation: TOperation = input.operation

	for (const { implementation } of contributions) {
		if (!matchesContribution(implementation, operation)) {
			continue
		}

		const output: unknown = await implementation.run(
			createBeforeHookInput(input.context, operation),
		)

		operation = normalizeBeforeHookOutput(operation, output)
	}

	return operation
}

const runAfterContributions = async <
	const TOperation extends DatabaseOperationAst,
>(
	contributions: readonly OwnedRuntimeContribution[],
	input: RuntimeResultStageInput<TOperation>,
): Promise<DatabaseOperationResult<TOperation>> => {
	let result: DatabaseOperationResult<TOperation> = input.result

	for (const { implementation } of contributions) {
		if (!matchesContribution(implementation, input.operation)) {
			continue
		}

		const output: unknown = await implementation.run(
			createAfterHookInput(input.context, input.operation, result),
		)

		result = normalizeAfterHookOutput<TOperation>(output)
	}

	return result
}

const runPostCommitContributions = async <
	const TOperation extends DatabaseOperationAst,
>(
	contributions: readonly OwnedRuntimeContribution[],
	input: RuntimeResultStageInput<TOperation>,
): Promise<void> => {
	for (const { implementation } of contributions) {
		if (matchesContribution(implementation, input.operation)) {
			await implementation.run(input)
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
		globalBeforeHooks: (input) => runBeforeContributions(globalBefore, input),
		schemaBeforeHooks: (input) => runBeforeContributions(schemaBefore, input),
		schemaAfterHooks: (input) => runAfterContributions(schemaAfter, input),
		globalAfterHooks: (input) => runAfterContributions(globalAfter, input),
		postCommitEvents: (input) => runPostCommitContributions(events, input),
	})
}
