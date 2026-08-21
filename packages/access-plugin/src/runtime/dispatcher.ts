import { immutableRecord } from '@ultimabase/shared'
import type {
	ApplicationCallbackExecutor,
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationOutcome,
	ProtectedPolicyEffects,
	QueryRelationFilterNode,
	RuntimeMutationOutcomeStageInput,
	RuntimeOperationStageInput,
	RuntimePreparedMutationStageInput,
	RuntimeRelationEnforcementStageInput,
	SchemaDefinition,
} from '@ultimabase/core'
import type { AccessPlan, SchemaAccessPlan } from '../authoring/plan.js'
import type { AccessDiagnosticsObserver } from './diagnostics.js'
import { AccessExecutionRuntime } from './execution-runtime.js'
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

/** Executes one application's immutable official Access plan at Runtime boundaries. */
export class AccessRuntime {
	readonly #plan: AccessPlan
	readonly #runtime: AccessExecutionRuntime

	constructor(
		plan: AccessPlan,
		observer?: AccessDiagnosticsObserver,
		callbacks?: ApplicationCallbackExecutor,
	) {
		this.#plan = plan
		this.#runtime = new AccessExecutionRuntime(observer, callbacks)
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
	): Promise<ProtectedPolicyEffects> {
		const schemaPlan = this.#readSchemaPlan(request.operation)

		const rowFilter = await evaluateAccessOperationAndFilter(
			this.#runtime,
			request,
			this.#plan,
			schemaPlan,
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

		const permitted = computeAccessStaticSelection(this.#plan, schemaPlan)
		assertAccessExplicitSelection(request, this.#plan, schemaPlan, permitted)
		return immutableRecord({
			...(rowFilter === undefined ? {} : { rowFilter }),
			...(permitted === undefined ? {} : { selectionFields: permitted }),
		})
	}

	async reevaluate<const TOperation extends DatabaseOperationAst>(
		request: RuntimeOperationStageInput<TOperation>,
	): Promise<boolean> {
		const schemaPlan = this.#readSchemaPlan(request.operation)

		await evaluateAccessMutationFieldRules(
			this.#runtime,
			request,
			this.#plan,
			schemaPlan,
		)
		await evaluateAccessCreateItems(this.#runtime, request, schemaPlan)

		return true
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

		// Pointer predicates are checked through their ordinary `where` channel;
		// this guard owns only source relation handles that have no row value.
		if (field?.field.kind === 'pointer') {
			return
		}
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
