import type {
	FrameworkApplication,
	PluginDefinition,
} from '../../foundation.js'
import type { QueryRelationFilterNode } from '../../query/index.js'
import type { SchemaDefinition } from '../../schema/index.js'
import {
	getApplicationAccessPlan,
	type AccessPlan,
	type SchemaAccessPlan,
} from '../../schema/access/plan.js'
import { immutableRecord } from '@ultimabase/shared'

import type {
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationOutcome,
} from '../database/contracts.js'
import {
	narrowEnforcementFields,
	type EnforcementState,
} from '../enforcement/state.js'
import {
	getApplicationHookExecutionRuntime,
	type HookExecutionRuntime,
} from '../hooks/execution-runtime.js'
import type {
	RuntimeMutationOutcomeStageInput,
	RuntimeOperationStageInput,
	RuntimePreparedMutationStageInput,
	RuntimeRelationEnforcementStageInput,
} from '../pipeline/contracts.js'
import {
	enforceAccessMutationOutcome,
	enforceAccessPreparedMutation,
	evaluateAccessCreateItems,
	requiresAccessPreparedMutationItems,
} from './item-access.js'
import { evaluateAccessMutationFieldRules } from './mutation-transitions.js'
import {
	assertAccessExplicitSelection,
	computeAccessStaticSelection,
	enforceAccessOutput,
} from './output-access.js'
import {
	assertAccessDecisionRules,
	evaluateAccessFieldReferenceRules,
	evaluateAccessOperationAndFilter,
	readAccessSchema,
} from './rule-evaluation.js'

/** Executes one application's immutable native Access plan at Runtime boundaries. */
export class NativeAccessRuntime {
	readonly #plan: AccessPlan
	readonly #runtime: HookExecutionRuntime

	constructor(
		application: FrameworkApplication<
			readonly SchemaDefinition[],
			readonly PluginDefinition[]
		>,
	) {
		this.#plan = getApplicationAccessPlan(application)
		this.#runtime = getApplicationHookExecutionRuntime(application)
		Object.freeze(this)
	}

	#readSchemaPlan(operation: DatabaseOperationAst): SchemaAccessPlan {
		const schemaPlan = this.#plan.getSchema(readAccessSchema(operation))

		if (schemaPlan === undefined) {
			throw new TypeError(
				'Native Access plan does not own the operation schema',
			)
		}

		return schemaPlan
	}

	async evaluate<const TOperation extends DatabaseOperationAst>(
		request: RuntimeOperationStageInput<TOperation>,
		state: EnforcementState,
	): Promise<EnforcementState> {
		const schemaPlan = this.#readSchemaPlan(request.operation)

		let next = await evaluateAccessOperationAndFilter(
			this.#runtime,
			request,
			this.#plan,
			schemaPlan,
			state,
		)
		await evaluateAccessFieldReferenceRules(
			this.#runtime,
			request,
			this.#plan,
			schemaPlan,
		)
		await evaluateAccessMutationFieldRules(
			this.#runtime,
			request,
			this.#plan,
			schemaPlan,
		)
		await evaluateAccessCreateItems(this.#runtime, request, schemaPlan)

		const permitted = computeAccessStaticSelection(
			request,
			this.#plan,
			schemaPlan,
		)
		assertAccessExplicitSelection(request, this.#plan, schemaPlan, permitted)
		if (permitted !== undefined) {
			next = narrowEnforcementFields(next, 'selection', permitted)
		}

		return next
	}

	async reevaluate<const TOperation extends DatabaseOperationAst>(
		request: RuntimeOperationStageInput<TOperation>,
		state: EnforcementState,
	): Promise<EnforcementState> {
		const schemaPlan = this.#readSchemaPlan(request.operation)

		await evaluateAccessMutationFieldRules(
			this.#runtime,
			request,
			this.#plan,
			schemaPlan,
		)
		await evaluateAccessCreateItems(this.#runtime, request, schemaPlan)

		return state
	}

	/** Enforces one relation source field absent from persisted row output. */
	async enforceRelationRead(
		request: RuntimeRelationEnforcementStageInput,
	): Promise<void> {
		return this.#enforceRelationFieldRead(
			request,
			request.relation.source,
			request.relation.fieldPath,
		)
	}

	/** Enforces relationship traversal declared inside one public where filter. */
	async enforceRelationPredicateRead(
		request: RuntimeOperationStageInput<DatabaseOperationAst>,
		predicate: QueryRelationFilterNode,
	): Promise<void> {
		const sourceField = predicate.source.definition.fields[predicate.field]

		if (sourceField?.kind === 'pointer') {
			return
		}

		return this.#enforceRelationFieldRead(
			request,
			predicate.source.definition,
			[predicate.field],
		)
	}

	async #enforceRelationFieldRead(
		request: RuntimeOperationStageInput<DatabaseOperationAst>,
		source: SchemaDefinition,
		fieldPath: readonly string[],
	): Promise<void> {
		const field = this.#plan.getField(source, fieldPath)

		if (field?.field.kind !== 'relation') {
			throw new TypeError('Native Access relation field is unavailable')
		}

		await assertAccessDecisionRules(
			this.#runtime,
			request,
			field.read.item,
			{
				branch: 'item',
				field,
				phase: 'access-field-read',
				schema: source,
			},
			immutableRecord({ context: request.context }),
			this.#plan.defaults.field,
		)
	}

	/** Requests set preimages only when configured rules need item values. */
	requiresPreparedMutationItems(
		operation: DatabaseMutationOperationAst,
	): boolean {
		return requiresAccessPreparedMutationItems(this.#plan, operation)
	}

	async enforcePreparedMutation<
		const TOperation extends DatabaseMutationOperationAst,
	>(request: RuntimePreparedMutationStageInput<TOperation>): Promise<void> {
		return enforceAccessPreparedMutation(this.#runtime, this.#plan, request)
	}

	async enforceMutationOutcome<
		const TOperation extends DatabaseMutationOperationAst,
	>(
		request: RuntimeMutationOutcomeStageInput<TOperation>,
	): Promise<DatabaseOperationOutcome<TOperation>> {
		return enforceAccessMutationOutcome(this.#runtime, this.#plan, request)
	}

	async enforceOutput<
		const TOperation extends DatabaseOperationAst,
		const TResult,
	>(
		request: RuntimeOperationStageInput<TOperation> & {
			readonly result: TResult
		},
	): Promise<TResult> {
		return enforceAccessOutput(
			this.#runtime,
			request,
			this.#plan,
			this.#readSchemaPlan(request.operation),
		)
	}
}
