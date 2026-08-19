import type {
	FrameworkApplication,
	PluginDefinition,
} from '../../foundation.js'
import type { OwnedPluginContribution } from '../../plugins/setup-registries.js'
import { readApplicationCapabilityContributions } from '../../plugins/application-capability-access.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
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
	createHookExecutionDescriptor,
	createPluginHookOwner,
	createSchemaHookTarget,
	globalHookTarget,
	type HookExecutionDescriptor,
} from '../hooks/execution-descriptor.js'
import type { HookExecutionRuntime } from '../hooks/execution-runtime.js'
import { getOperationSchema } from '../operations/schema.js'
import type { RuntimeOperationStageInput } from '../pipeline/contracts.js'
import type { EnforcementContributionImplementation } from './definitions.js'
import {
	getEnforcementContributionImplementation,
	matchesEnforcementContribution,
} from './definitions.js'
import {
	appendEnforcementConstraints,
	createEnforcementState,
	narrowEnforcementFields,
	type EnforcementState,
} from './state.js'
import { runtimeConstraintCapability } from '../capabilities.js'

/** @internal Associates one protected implementation with its setup owner. */
export interface OwnedEnforcementContribution {
	readonly contribution: OwnedPluginContribution
	readonly implementation: EnforcementContributionImplementation
}

/** Gives policy hooks the same recursion and diagnostic identity as business hooks. */
export const createEnforcementExecutionDescriptor = (
	owned: OwnedEnforcementContribution,
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

/** Compiles only protected enforcement definitions from the shared hook registry. */
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
		const implementation = getEnforcementContributionImplementation(
			contribution.value,
		)

		if (implementation === undefined) {
			continue
		}

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
	runtime: HookExecutionRuntime,
	input: RuntimeOperationStageInput<TOperation>,
	initialState: EnforcementState = createEnforcementState(),
): Promise<EnforcementState> => {
	const schema = readEnforcementOperationSchema(input.operation)
	let state = initialState

	for (const owned of contributions) {
		const { contribution, implementation } = owned
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
