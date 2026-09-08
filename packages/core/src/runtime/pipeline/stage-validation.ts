import { isPlainRecord } from '@ultimabase/shared'

import type {
	RuntimeBehaviorStages,
	RuntimeEnforcementStages,
	RuntimePipelineStages,
} from './contracts.js'

const functionStageNames = [
	'normalization',
	'structuralValidation',
	'finalMutationValidation',
	'commit',
] as const satisfies readonly (keyof RuntimePipelineStages)[]

const enforcementStageNames = [
	'enforceOperation',
	'enforceResult',
	'enforceSelectionResult',
	'evaluate',
	'reevaluate',
] as const satisfies readonly (keyof RuntimeEnforcementStages)[]

const runtimeBehaviorStageNames = [
	'beforeOperation',
	'guardMutationInput',
	'observePreparedMutation',
	'postCommit',
	'requiresPreparedMutationItems',
	'transformDatabaseResult',
	'transformInput',
	'transformMutationOutcome',
	'transformPreparedInput',
	'transformPreparedOperation',
	'transformResult',
] as const satisfies readonly (keyof RuntimeBehaviorStages)[]

/** Rejects incomplete JavaScript assembly before an operation can start. */
export const assertRuntimePipelineStages = (
	stages: RuntimePipelineStages,
): void => {
	const untrustedStages: unknown = stages

	if (!isPlainRecord(untrustedStages)) {
		throw new TypeError('Runtime pipeline stages must be a plain object')
	}

	for (const stageName of functionStageNames) {
		if (typeof untrustedStages[stageName] !== 'function') {
			throw new TypeError(
				`Runtime pipeline stage ${stageName} must be a function`,
			)
		}
	}

	const enforcement: unknown = untrustedStages.enforcement
	const behaviors: unknown = untrustedStages.behaviors

	if (behaviors !== undefined) {
		if (!isPlainRecord(behaviors)) {
			throw new TypeError('Runtime pipeline behaviors must be a plain object')
		}

		for (const stageName of runtimeBehaviorStageNames) {
			if (
				behaviors[stageName] !== undefined &&
				typeof behaviors[stageName] !== 'function'
			) {
				throw new TypeError(
					`Runtime behavior stage ${stageName} must be a function`,
				)
			}
		}
	}

	if (enforcement !== undefined) {
		if (!isPlainRecord(enforcement)) {
			throw new TypeError('Runtime pipeline enforcement must be a plain object')
		}

		for (const stageName of enforcementStageNames) {
			if (typeof enforcement[stageName] !== 'function') {
				throw new TypeError(
					`Runtime enforcement stage ${stageName} must be a function`,
				)
			}
		}

		for (const stageName of [
			'enforceMutationOutcome',
			'enforcePreparedMutation',
			'enforceRelationRead',
		] as const) {
			if (
				enforcement[stageName] !== undefined &&
				typeof enforcement[stageName] !== 'function'
			) {
				throw new TypeError(
					`Runtime enforcement stage ${stageName} must be a function`,
				)
			}
		}
	}

	const databaseOperation: unknown = untrustedStages.databaseOperation

	if (
		typeof databaseOperation !== 'object' ||
		databaseOperation === null ||
		!('execute' in databaseOperation) ||
		typeof databaseOperation.execute !== 'function'
	) {
		throw new TypeError(
			'Runtime pipeline databaseOperation must be an operation executor',
		)
	}

	if (
		untrustedStages.persistencePlanRewrite !== undefined &&
		typeof untrustedStages.persistencePlanRewrite !== 'function'
	) {
		throw new TypeError(
			'Runtime pipeline stage persistencePlanRewrite must be a function',
		)
	}
}
