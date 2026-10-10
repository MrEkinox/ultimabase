import {
	type FindManyOperationAst,
	type UpdateManyOperationAst,
	type UpdateOneOperationAst,
} from '../../src/query/index.js'
import { SchemaRegistry } from '../../src/schema/index.js'
import { immutableRecord } from '@ultimabase/shared'
import { expect } from 'vitest'

import {
	RequestContext,
	requestSources,
} from '../../src/runtime/context/request-context.js'

import type {
	DatabaseAdapterCapabilities,
	DatabaseOperationAst,
	DatabaseOperationExecutor,
	DatabaseOperationRequest,
	DatabaseOperationResult,
} from '../../src/runtime/database/contracts.js'
import { databasePersistencePlanCapability } from '../../src/runtime/database/contracts.js'
import { createEnforcementState } from '../../src/runtime/enforcement/state.js'
import type {
	RuntimeEnforcementStages,
	RuntimeBehaviorStages,
	RuntimeProjectedDatabaseResultTransformStage,
	RuntimeOperationGuardStage,
	RuntimeOperationStageInput,
	RuntimeOperationTransformStage,
	RuntimePipelineStages,
	RuntimeResultEffectStage,
	RuntimeResultTransformStage,
} from '../../src/runtime/pipeline/contracts.js'
import { UltimaBase } from '../../src/runtime/application/ultima-base.js'
import { testDatabaseFilterOperators } from '../../../../tooling/vitest/database-filter-operators.js'
import { QueryBuilder } from '../../src/plugin.js'

export const articleSchema = UltimaBase.Schema.define({
	className: 'Article',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})

export const articleOperation = {
	kind: 'find-many',
	query: new QueryBuilder(articleSchema).take(10).ast,
} satisfies FindManyOperationAst<typeof articleSchema>

export const articleUpdateOperation = {
	kind: 'update-one',
	query: new QueryBuilder(articleSchema).where((where) =>
		where.eq('id', '0198f090-2a50-7000-8000-000000000081'),
	).ast,
	update: {
		kind: 'update-expression',
		operations: [{ field: 'title', kind: 'set', value: 'requested' }],
	},
} satisfies UpdateOneOperationAst<typeof articleSchema>

export const articleUpdateManyOperation = {
	kind: 'update-many',
	query: new QueryBuilder(articleSchema).ast,
	update: {
		kind: 'update-expression',
		operations: [{ field: 'title', kind: 'set', value: 'requested' }],
	},
} satisfies UpdateManyOperationAst<typeof articleSchema>

export const relationPredicateTarget = UltimaBase.Schema.define({
	className: 'RuntimeRelationPredicateTarget',
	fields: (field) => ({ label: field.string() }),
})
export const relationPredicateSource = UltimaBase.Schema.define({
	className: 'RuntimeRelationPredicateSource',
	fields: (field) => ({
		targets: field.relation({ target: 'RuntimeRelationPredicateTarget' }),
	}),
})
new SchemaRegistry([
	relationPredicateTarget,
	relationPredicateSource,
]).resolveSchemaTargets()
export const relationPredicateOperation = {
	kind: 'find-many',
	// This Runtime fixture has no generated named relation graph.
	query: new QueryBuilder(relationPredicateSource).where((where) =>
		where.some('targets', (target) => target.eq('label', 'portable')),
	).ast as never,
} satisfies FindManyOperationAst<typeof relationPredicateSource>

export const requestContext = RequestContext.anonymous({
	requestId: 'request-1',
	source: requestSources.internal,
})

export const createOperationTransform =
	(stageName: string, trace: string[]): RuntimeOperationTransformStage =>
	<const TOperation extends DatabaseOperationAst>(
		input: RuntimeOperationStageInput<TOperation>,
	): TOperation => {
		trace.push(stageName)
		expect(Object.isFrozen(input)).toBe(true)
		expect(input).not.toHaveProperty('relation')

		return input.operation
	}

export const createGuard =
	(stageName: string, trace: string[]): RuntimeOperationGuardStage =>
	(input): void => {
		trace.push(stageName)
		expect(Object.isFrozen(input)).toBe(true)
	}

export const createEnforcementStages = (
	trace: string[],
	distinctReevaluation = false,
): RuntimeEnforcementStages => {
	const state = createEnforcementState()
	const reevaluatedState = distinctReevaluation
		? createEnforcementState()
		: state

	return {
		evaluate: (input) => {
			trace.push('enforcement:evaluate')
			expect(Object.isFrozen(input)).toBe(true)

			return state
		},
		reevaluate: (input) => {
			trace.push('enforcement:reevaluate')
			expect(Object.isFrozen(input)).toBe(true)
			expect(input.enforcement).toBe(state)

			return reevaluatedState
		},
		enforceOperation: (input) => {
			trace.push('enforcement:operation')
			expect(Object.isFrozen(input)).toBe(true)
			expect([state, reevaluatedState]).toContain(input.enforcement)

			return { operation: input.operation }
		},
		enforceSelectionResult: (input) => {
			trace.push('enforcement:selection-result')
			expect(Object.isFrozen(input)).toBe(true)
			expect([state, reevaluatedState]).toContain(input.enforcement)

			return input.result
		},
		enforceResult: (input) => {
			trace.push('enforcement:result')
			expect(Object.isFrozen(input)).toBe(true)
			expect([state, reevaluatedState]).toContain(input.enforcement)

			return input.result
		},
	}
}

export const createResultTransform =
	(stageName: string, trace: string[]): RuntimeResultTransformStage =>
	(input) => {
		trace.push(stageName)
		expect(Object.isFrozen(input)).toBe(true)

		return input.result
	}

export const createProjectedDatabaseResultTransform =
	(
		stageName: string,
		trace: string[],
	): RuntimeProjectedDatabaseResultTransformStage =>
	(input) => {
		trace.push(stageName)
		expect(Object.isFrozen(input)).toBe(true)

		return input.result
	}

export const createResultEffect =
	(stageName: string, trace: string[]): RuntimeResultEffectStage =>
	(input): void => {
		trace.push(stageName)
		expect(Object.isFrozen(input)).toBe(true)
	}

export const createBehaviorStages = (
	trace: string[],
): RuntimeBehaviorStages => ({
	requiresPreparedMutationItems: () => false,
	transformInput: createOperationTransform('behavior:transformInput', trace),
	transformPreparedInput: (input) => {
		trace.push('behavior:transformPreparedInput')

		return input.operation
	},
	transformPreparedOperation: (input) => {
		trace.push('behavior:transformPreparedOperation')

		return immutableRecord({ ...input.operation })
	},
	beforeOperation: createGuard('behavior:beforeOperation', trace),
	observePreparedMutation: (input) => {
		trace.push('behavior:observePreparedMutation')
		expect(Object.isFrozen(input)).toBe(true)
	},
	transformMutationOutcome: (input) => {
		trace.push('behavior:transformMutationOutcome')

		return input.outcome
	},
	transformDatabaseResult: createProjectedDatabaseResultTransform(
		'behavior:transformDatabaseResult',
		trace,
	),
	transformResult: createResultTransform('behavior:transformResult', trace),
	postCommit: createResultEffect('behavior:postCommit', trace),
})

export class TraceDatabaseExecutor implements DatabaseOperationExecutor {
	readonly requests: DatabaseOperationRequest[] = []
	readonly capabilities: DatabaseAdapterCapabilities

	constructor(
		private readonly trace: string[],
		private readonly fixtureResult: unknown,
		capabilities: DatabaseAdapterCapabilities = {},
	) {
		this.capabilities = immutableRecord({
			persistencePlans: databasePersistencePlanCapability,
			filterOperators: testDatabaseFilterOperators,
			...capabilities,
		})
	}

	execute<const TOperation extends DatabaseOperationAst>(
		request: DatabaseOperationRequest<TOperation>,
	): Promise<DatabaseOperationResult<TOperation>> {
		this.trace.push('databaseOperation')
		this.requests.push(request)
		expect(Object.isFrozen(request)).toBe(true)

		return Promise.resolve(
			this.fixtureResult as DatabaseOperationResult<TOperation>,
		)
	}
}

export const createStages = (
	trace: string[],
	databaseOperation: DatabaseOperationExecutor,
	overrides: Partial<RuntimePipelineStages> = {},
): RuntimePipelineStages => ({
	normalization: createOperationTransform('normalization', trace),
	structuralValidation: createOperationTransform('structuralValidation', trace),
	finalMutationValidation: createOperationTransform('final-validation', trace),
	databaseOperation,
	commit: createResultEffect('commit', trace),
	...overrides,
})
