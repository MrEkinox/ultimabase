import { FrameworkApplication } from '../../application/framework-application.js'
import type { PluginDefinition } from '../../plugins/definition.js'
import type { SchemaDefinition } from '../../schema/index.js'
import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { haveSameEnumerableKeys } from '../../exact-object-validation.js'

import type { DatabaseMutationOperationAst } from '../database/contracts.js'
import { getOperationSchema } from '../operations/schema.js'
import type {
	RuntimeBehaviorStages,
	RuntimeLogicalOperationAst,
} from '../pipeline/contracts.js'
import { getRuntimeContributionImplementation } from './definitions.js'
import {
	createContributionCallbackDescriptor,
	getApplicationRuntimeCallbackExecutor,
	readOwnedRuntimeContributions,
	type OwnedRuntimeContribution,
} from './execution.js'
import { runtimeInterceptorCapability } from '../capabilities.js'

type OwnedInterceptor = OwnedRuntimeContribution<
	NonNullable<ReturnType<typeof getRuntimeContributionImplementation>>
>

const assertExactContributionOutput = (
	output: unknown,
): Readonly<Record<string, unknown>> => {
	if (
		!isPlainRecord(output) ||
		!Object.hasOwn(output, 'operation') ||
		Object.keys(output).length !== 1
	) {
		throw new TypeError(
			'Runtime contribution must return exactly { operation }',
		)
	}

	return output
}

/** Proves both records share one key set and identical values outside `replaced`. */
const differsOnlyAt = (
	previous: Readonly<Record<string, unknown>>,
	next: Readonly<Record<string, unknown>>,
	replaced: string,
): boolean =>
	haveSameEnumerableKeys(previous, next) &&
	Object.keys(previous).every(
		(key) => key === replaced || next[key] === previous[key],
	)

/** Restricts the late prepared boundary to values in an existing update shape. */
const normalizePreparedContributionOutput = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	previousOperation: TOperation,
	output: unknown,
): TOperation => {
	const candidate: unknown = assertExactContributionOutput(output).operation

	if (candidate === previousOperation) return previousOperation

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
	const previous: unknown = previousOperation

	if (!isPlainRecord(previous)) {
		throw new TypeError(
			'prepared-operation contribution requires plain operations',
		)
	}

	if (!differsOnlyAt(previous, candidate, 'update')) {
		throw new TypeError(
			'prepared-operation contribution may only replace update values',
		)
	}

	const previousUpdate: unknown = previous.update
	const nextUpdate: unknown = candidate.update

	if (
		!isPlainRecord(previousUpdate) ||
		!isPlainRecord(nextUpdate) ||
		previousUpdate.kind !== 'update-expression' ||
		nextUpdate.kind !== 'update-expression' ||
		!isUnknownArray(previousUpdate.operations) ||
		!isUnknownArray(nextUpdate.operations) ||
		!haveSameEnumerableKeys(previousUpdate, nextUpdate) ||
		previousUpdate.operations.length !== nextUpdate.operations.length
	) {
		throw new TypeError(
			'prepared-operation contribution must preserve the normalized update shape',
		)
	}

	const nextOperations = nextUpdate.operations

	for (const [
		index,
		previousCandidate,
	] of previousUpdate.operations.entries()) {
		const nextCandidate: unknown = nextOperations[index]

		if (
			!isPlainRecord(previousCandidate) ||
			!isPlainRecord(nextCandidate) ||
			!differsOnlyAt(previousCandidate, nextCandidate, 'value')
		) {
			throw new TypeError(
				'prepared-operation contribution must preserve every update operation',
			)
		}
	}

	return nextOperation
}

const matchesContribution = (
	{ implementation }: OwnedInterceptor,
	operation: RuntimeLogicalOperationAst,
): boolean =>
	(implementation.operations === undefined ||
		implementation.operations.includes(operation.kind)) &&
	(implementation.schema === undefined ||
		implementation.schema === getOperationSchema(operation))

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

	const interceptors = readOwnedRuntimeContributions(
		application,
		runtimeInterceptorCapability,
		'Runtime',
		({ value }) => {
			const implementation = getRuntimeContributionImplementation(value)
			// A missing implementation must never silently discard an interceptor.
			if (implementation === undefined) {
				throw new TypeError('Runtime interceptor implementation is unavailable')
			}
			return implementation
		},
	)
	if (interceptors.length === 0) return undefined

	const runtime = getApplicationRuntimeCallbackExecutor(application)

	// Locked-target transformers run only for a materialized singular update.
	const transformPreparedOperation: NonNullable<
		RuntimeBehaviorStages['transformPreparedOperation']
	> = async (input) => {
		const { context, target } = input
		let operation = input.operation
		if (
			operation.kind !== 'update-one' ||
			target === undefined ||
			target === null
		) {
			return operation
		}
		for (const owned of interceptors) {
			if (!matchesContribution(owned, operation)) continue
			const output = await runtime.invoke(
				createContributionCallbackDescriptor(
					owned.contribution,
					owned.implementation.kind,
					owned.implementation.schema,
					operation.kind,
				),
				context,
				() =>
					owned.implementation.run(
						immutableRecord({ context, operation, target }),
					),
			)
			operation = normalizePreparedContributionOutput(operation, output)
		}
		return operation
	}

	return immutableRecord({ transformPreparedOperation })
}
