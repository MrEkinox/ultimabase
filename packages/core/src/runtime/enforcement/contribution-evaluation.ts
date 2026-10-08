import type { FrameworkApplication } from '../../application/framework-application.js'
import type { PluginDefinition } from '../../foundation.js'
import type { OwnedPluginContribution } from '../../plugins/setup-registries.js'
import { runWithApplicationPluginOwner } from '../../plugins/callback-execution.js'
import type { PluginIdentity } from '../../plugins/manifest.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import type { QueryFilterNode } from '../../query/filters/logical.js'
import {
	normalizeWhereInput,
	whereInputFromQueryFilter,
} from '../../query/filters/where.js'
import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { RequestContext } from '../context/request-context.js'
import {
	createContributionCallbackDescriptor,
	readOwnedRuntimeContributions,
	type OwnedRuntimeContribution,
	type RuntimeCallbackDescriptor,
	type RuntimeCallbackExecutor,
} from '../contributions/execution.js'
import { getOperationSchema } from '../operations/schema.js'
import type {
	RuntimeLogicalOperationAst,
	RuntimeOperationStageInput,
} from '../pipeline/contracts.js'
import type { EnforcementContributionImplementation } from './definitions.js'
import type { EnforcementFieldBoundary } from './contracts.js'
import {
	getEnforcementContributionImplementation,
	matchesEnforcementContribution,
} from './definitions.js'
import {
	appendEnforcementRowFilter,
	createEnforcementState,
	narrowEnforcementFields,
	type EnforcementState,
} from './state.js'
import { runtimeConstraintCapability } from '../capabilities.js'
import {
	getProtectedPolicyImplementation,
	normalizeProtectedPolicyEffects,
	type ProtectedPolicyImplementation,
} from './protected-policy.js'
import { createProtectedPolicyDeniedError } from './protected-denial.js'

/** @internal Associates one protected implementation with its setup owner. */
export type OwnedEnforcementContribution = OwnedRuntimeContribution<
	EnforcementContributionImplementation | ProtectedPolicyImplementation
>

/** Retains one policy provider owner across every callback Core invokes directly. */
const attributeProtectedPolicy = (
	application: object,
	owner: PluginIdentity,
	implementation: ProtectedPolicyImplementation,
): ProtectedPolicyImplementation => {
	const run = <TResult>(callback: () => TResult): TResult =>
		runWithApplicationPluginOwner(application, owner, callback)
	const {
		evaluate,
		mutationOutcome,
		preparedMutation,
		reevaluate,
		relation,
		requiresPreparedMutationItems,
		restrictResult,
	} = implementation

	return immutableRecord({
		...implementation,
		evaluate:
			evaluate === undefined
				? undefined
				: (input) => run(() => evaluate(input)),
		mutationOutcome:
			mutationOutcome === undefined
				? undefined
				: (input) => run(() => mutationOutcome(input)),
		preparedMutation:
			preparedMutation === undefined
				? undefined
				: (input) => run(() => preparedMutation(input)),
		reevaluate:
			reevaluate === undefined
				? undefined
				: (input) => run(() => reevaluate(input)),
		relation:
			relation === undefined
				? undefined
				: (input) => run(() => relation(input)),
		requiresPreparedMutationItems:
			requiresPreparedMutationItems === undefined
				? undefined
				: (operation) => run(() => requiresPreparedMutationItems(operation)),
		restrictResult:
			restrictResult === undefined
				? undefined
				: (input) => run(() => restrictResult(input)),
	} satisfies ProtectedPolicyImplementation)
}

/** Gives policy callbacks one stable product-neutral recursion identity. */
export const createEnforcementExecutionDescriptor = (
	{ contribution, implementation }: OwnedEnforcementContribution,
	operation: RuntimeLogicalOperationAst,
): RuntimeCallbackDescriptor => {
	if (implementation.kind === 'protected-policy') {
		throw new TypeError(
			'Protected policies do not expose executable callback descriptors',
		)
	}
	return createContributionCallbackDescriptor(
		contribution,
		implementation.kind,
		implementation.schema,
		operation.kind,
	)
}

/** Returns a trusted schema only after preserving the normalized AST invariant. */
export const readEnforcementOperationSchema = (
	operation: RuntimeLogicalOperationAst,
): SchemaDefinition => {
	const schema: unknown = getOperationSchema(operation)

	if (!Schema.is(schema)) {
		throw new TypeError('Runtime enforcement requires a schema definition')
	}

	return schema
}

/** Skips a contribution entirely when it explicitly opts out for trusted Master. */
export const bypassesMaster = (
	implementation: Readonly<{ master: 'bypass' | 'enforce' }>,
	context: RequestContext,
): boolean =>
	context.access.mode === 'master' && implementation.master === 'bypass'

/** Compiles only protected enforcement definitions from generic capabilities. */
export const readEnforcementContributions = (
	application: FrameworkApplication<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
): readonly OwnedEnforcementContribution[] =>
	readOwnedRuntimeContributions(
		application,
		runtimeConstraintCapability,
		'Enforcement',
		({ ownerInstanceId, ownerPlugin, value }) => {
			const protectedPolicy = getProtectedPolicyImplementation(value)
			return protectedPolicy === undefined
				? getEnforcementContributionImplementation(value)
				: attributeProtectedPolicy(
						application,
						{
							pluginId: ownerPlugin,
							...(ownerInstanceId === undefined
								? {}
								: { instanceId: ownerInstanceId }),
						},
						protectedPolicy,
					)
		},
	)

/** Validates one field boundary against persisted input or logical output names. */
export const normalizeEnforcementRestrictedFields = (
	fields: unknown,
	schema: SchemaDefinition,
	contribution: OwnedPluginContribution,
	boundary: EnforcementFieldBoundary,
): readonly string[] => {
	if (!isUnknownArray(fields)) {
		throw new TypeError(
			`Enforcement contribution "${contribution.name}" must return a field array`,
		)
	}

	const normalized: string[] = []
	const declaredFields =
		boundary === 'input' ? schema.persistedFields : schema.fields

	for (const field of fields) {
		if (typeof field !== 'string' || !Object.hasOwn(declaredFields, field)) {
			throw new TypeError(
				`Enforcement contribution "${contribution.name}" returned an unknown schema field`,
			)
		}

		if (!normalized.includes(field)) {
			normalized.push(field)
		}
	}

	return immutableArray(normalized)
}

/** Evaluates every guard and protected policy once while keeping accumulated state private. */
export const evaluateEnforcementContributions = async <
	const TOperation extends RuntimeLogicalOperationAst,
>(
	contributions: readonly OwnedEnforcementContribution[],
	runtime: RuntimeCallbackExecutor,
	input: RuntimeOperationStageInput<TOperation>,
	initialState: EnforcementState = createEnforcementState(),
	includeProtectedPolicies = true,
): Promise<EnforcementState> => {
	const { context, nestedWrite, operation } = input
	const schema = readEnforcementOperationSchema(operation)
	// Every handler receives its own immutable envelope without accumulated state.
	const createHandlerInput = () =>
		immutableRecord({
			context,
			...(nestedWrite === undefined ? {} : { nestedWrite }),
			operation,
		})
	let state = initialState

	for (const owned of contributions) {
		const { contribution, implementation } = owned
		const narrow = (boundary: 'input' | 'selection', fields: unknown) => {
			state = narrowEnforcementFields(
				state,
				boundary,
				normalizeEnforcementRestrictedFields(
					fields,
					schema,
					contribution,
					boundary,
				),
			)
		}
		if (bypassesMaster(implementation, context)) continue

		if (implementation.kind === 'protected-policy') {
			if (
				!includeProtectedPolicies ||
				!matchesEnforcementContribution(implementation, operation, schema) ||
				implementation.evaluate === undefined
			) {
				continue
			}

			const effects = normalizeProtectedPolicyEffects(
				(await implementation.evaluate(createHandlerInput())) ?? {},
			)
			if (effects.allowed === false) {
				throw createProtectedPolicyDeniedError()
			}
			if (effects.rowFilter !== undefined) {
				const rowFilter = normalizeWhereInput(
					schema,
					whereInputFromQueryFilter(
						effects.rowFilter as QueryFilterNode<typeof schema>,
					),
				)
				state = appendEnforcementRowFilter(state, rowFilter)
			}
			if (effects.inputFields !== undefined) {
				narrow('input', effects.inputFields)
			}
			if (effects.selectionFields !== undefined) {
				narrow('selection', effects.selectionFields)
			}
			continue
		}

		if (!matchesEnforcementContribution(implementation, operation, schema)) {
			continue
		}

		// Guards are deny-only: they reject by throwing and never add an effect.
		const output: unknown = await runtime.invoke(
			createEnforcementExecutionDescriptor(owned, operation),
			context,
			() => implementation.run(createHandlerInput() as never),
		)
		if (output !== undefined) {
			throw new TypeError(
				`Enforcement guard "${contribution.name}" must return undefined`,
			)
		}
	}

	return state
}
