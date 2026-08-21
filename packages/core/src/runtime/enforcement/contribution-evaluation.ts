import type {
	FrameworkApplication,
	PluginDefinition,
} from '../../foundation.js'
import type { OwnedPluginContribution } from '../../plugins/setup-registries.js'
import { readApplicationCapabilityContributions } from '../../plugins/application-capability-access.js'
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

import type {
	DatabaseConstraintNode,
	DatabaseOperationAst,
} from '../database/contracts.js'
import {
	createRuntimeCallbackDescriptor,
	type RuntimeCallbackDescriptor,
	type RuntimeCallbackExecutor,
} from '../contributions/execution.js'
import { getOperationSchema } from '../operations/schema.js'
import type { RuntimeOperationStageInput } from '../pipeline/contracts.js'
import type { EnforcementContributionImplementation } from './definitions.js'
import {
	getEnforcementContributionImplementation,
	matchesEnforcementContribution,
} from './definitions.js'
import {
	appendEnforcementRowFilter,
	appendEnforcementConstraints,
	createEnforcementState,
	narrowEnforcementFields,
	type EnforcementState,
} from './state.js'
import { runtimeConstraintCapability } from '../capabilities.js'
import {
	getProtectedPolicyImplementation,
	matchesProtectedPolicy,
	normalizeProtectedPolicyEffects,
	type ProtectedPolicyImplementation,
} from './protected-policy.js'
import { createProtectedPolicyDeniedError } from './protected-denial.js'

/** @internal Associates one protected implementation with its setup owner. */
export interface OwnedEnforcementContribution {
	readonly contribution: OwnedPluginContribution
	readonly implementation:
		EnforcementContributionImplementation | ProtectedPolicyImplementation
}

/** Retains one policy provider owner across every callback Core invokes directly. */
const attributeProtectedPolicy = (
	application: object,
	owner: PluginIdentity,
	implementation: ProtectedPolicyImplementation,
): ProtectedPolicyImplementation => {
	const evaluate = implementation.evaluate
	const mutationOutcome = implementation.mutationOutcome
	const preparedMutation = implementation.preparedMutation
	const reevaluate = implementation.reevaluate
	const relation = implementation.relation
	const requiresPreparedMutationItems =
		implementation.requiresPreparedMutationItems
	const restrictResult = implementation.restrictResult
	const run = <TResult>(callback: () => TResult): TResult =>
		runWithApplicationPluginOwner(application, owner, callback)
	const attributed: ProtectedPolicyImplementation = {
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
	}

	return immutableRecord(attributed)
}

/** Gives policy callbacks one stable product-neutral recursion identity. */
export const createEnforcementExecutionDescriptor = (
	owned: OwnedEnforcementContribution,
	operation: DatabaseOperationAst,
): RuntimeCallbackDescriptor => {
	const { contribution, implementation } = owned
	if (implementation.kind === 'protected-policy') {
		throw new TypeError(
			'Protected policies do not expose executable callback descriptors',
		)
	}
	return createRuntimeCallbackDescriptor({
		operationKind: operation.kind,
		owner: {
			contributionId: contribution.name,
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

/** Returns a trusted schema only after preserving the normalized AST invariant. */
export const readEnforcementOperationSchema = (
	operation: DatabaseOperationAst,
): SchemaDefinition => {
	const schema: unknown = getOperationSchema(operation)

	if (!Schema.is(schema)) {
		throw new TypeError('Runtime enforcement requires a schema definition')
	}

	return schema
}

/** Compiles only protected enforcement definitions from generic capabilities. */
export const readEnforcementContributions = (
	application: FrameworkApplication<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
): readonly OwnedEnforcementContribution[] => {
	const contributions: OwnedEnforcementContribution[] = []

	const capabilityContributions = readApplicationCapabilityContributions(
		application,
		runtimeConstraintCapability,
	).map(({ contributionId, owner, value }) =>
		immutableRecord({
			name: contributionId,
			ownerPlugin: owner.pluginId,
			...(owner.instanceId === undefined
				? {}
				: { ownerInstanceId: owner.instanceId }),
			value,
		}),
	)

	for (const contribution of capabilityContributions) {
		const selectedImplementation =
			getEnforcementContributionImplementation(contribution.value) ??
			getProtectedPolicyImplementation(contribution.value)

		if (selectedImplementation === undefined) {
			continue
		}
		const implementation =
			selectedImplementation.kind === 'protected-policy'
				? attributeProtectedPolicy(
						application,
						{
							pluginId: contribution.ownerPlugin,
							...(contribution.ownerInstanceId === undefined
								? {}
								: { instanceId: contribution.ownerInstanceId }),
						},
						selectedImplementation,
					)
				: selectedImplementation

		if (
			implementation.schema !== undefined &&
			!application.ownsSchema(implementation.schema)
		) {
			throw new TypeError(
				`Enforcement contribution "${contribution.name}" references a schema outside its application`,
			)
		}

		contributions.push(immutableRecord({ contribution, implementation }))
	}

	return immutableArray(contributions)
}

/** Rejects field names that do not belong to the exact operation schema. */
export const normalizeEnforcementRestrictedFields = (
	fields: unknown,
	schema: SchemaDefinition,
	contribution: OwnedPluginContribution,
): readonly string[] => {
	if (!isUnknownArray(fields)) {
		throw new TypeError(
			`Enforcement contribution "${contribution.name}" must return a field array`,
		)
	}

	const normalized: string[] = []

	for (const field of fields) {
		if (typeof field !== 'string' || !Object.hasOwn(schema.fields, field)) {
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

/** Evaluates every non-output policy once while keeping accumulated state private. */
export const evaluateEnforcementContributions = async <
	const TOperation extends DatabaseOperationAst,
>(
	contributions: readonly OwnedEnforcementContribution[],
	runtime: RuntimeCallbackExecutor,
	input: RuntimeOperationStageInput<TOperation>,
	initialState: EnforcementState = createEnforcementState(),
	includeProtectedPolicies = true,
): Promise<EnforcementState> => {
	const schema = readEnforcementOperationSchema(input.operation)
	let state = initialState

	for (const owned of contributions) {
		const { contribution, implementation } = owned
		if (implementation.kind === 'protected-policy') {
			if (
				!includeProtectedPolicies ||
				(input.context.access.mode === 'master' &&
					implementation.master === 'bypass') ||
				!matchesProtectedPolicy(implementation, input.operation, schema) ||
				implementation.evaluate === undefined
			) {
				continue
			}

			const effects = normalizeProtectedPolicyEffects(
				(await implementation.evaluate(
					immutableRecord({
						context: input.context,
						operation: input.operation,
					}),
				)) ?? {},
			)
			if (effects.allowed === false) {
				throw createProtectedPolicyDeniedError()
			}
			if (effects.constraints !== undefined) {
				state = appendEnforcementConstraints(state, effects.constraints)
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
				state = narrowEnforcementFields(
					state,
					'input',
					normalizeEnforcementRestrictedFields(
						effects.inputFields,
						schema,
						contribution,
					),
				)
			}
			if (effects.selectionFields !== undefined) {
				state = narrowEnforcementFields(
					state,
					'selection',
					normalizeEnforcementRestrictedFields(
						effects.selectionFields,
						schema,
						contribution,
					),
				)
			}
			continue
		}

		if (
			implementation.kind === 'restrictOutput' ||
			(input.context.access.mode === 'master' &&
				implementation.master === 'bypass') ||
			!matchesEnforcementContribution(implementation, input.operation, schema)
		) {
			continue
		}

		const output: unknown = await runtime.invoke(
			createEnforcementExecutionDescriptor(owned, input.operation),
			input.context,
			() =>
				implementation.run(
					immutableRecord({
						context: input.context,
						operation: input.operation,
					}) as never,
				),
		)

		switch (implementation.kind) {
			case 'guard':
				if (output !== undefined) {
					throw new TypeError(
						`Enforcement guard "${contribution.name}" must return undefined`,
					)
				}
				break
			case 'constraint':
				state = appendEnforcementConstraints(
					state,
					output as DatabaseConstraintNode | readonly DatabaseConstraintNode[],
				)
				break
			case 'restrictInput':
			case 'restrictSelection': {
				const boundary =
					implementation.kind === 'restrictInput' ? 'input' : 'selection'
				state = narrowEnforcementFields(
					state,
					boundary,
					normalizeEnforcementRestrictedFields(output, schema, contribution),
				)
				break
			}
		}
	}

	return state
}
