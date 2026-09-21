import { immutableRecord } from '@ultimabase/shared'
import type {
	ApplicationCallbackExecutor,
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseOperationOutcome,
	ProtectedPolicyEffects,
	RuntimeMutationOutcomeStageInput,
	RuntimeOperationStageInput,
	RuntimePreparedMutationStageInput,
	RuntimeRelationEnforcementStageInput,
} from '@ultimabase/core'
import { allowUndeclaredFieldAccess } from '../authoring/plan.js'
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
	type AccessRuntimeRequest,
} from './rule-evaluation.js'
import {
	enforceSchemaMutationItemAccess,
	evaluateSchemaMutationAccess,
	isSchemaMutationAccessRequest,
} from './schema-mutation-access.js'

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

	#readSchemaPlan(operation: unknown): SchemaAccessPlan {
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
		const accessRequest = request as unknown as AccessRuntimeRequest
		const schemaPlan = this.#readSchemaPlan(accessRequest.operation)

		const schemaMutation = isSchemaMutationAccessRequest(accessRequest)
		const rowFilter = schemaMutation
			? await evaluateSchemaMutationAccess(
					this.#runtime,
					accessRequest,
					this.#plan,
					schemaPlan,
				)
			: await evaluateAccessOperationAndFilter(
					this.#runtime,
					request,
					this.#plan,
					schemaPlan,
				)

		// Custom schema mutations keep their logical rules and item enforcement;
		// native field transitions and create-item checks belong only to CRUD.
		if (!schemaMutation) {
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
		}

		const permitted = computeAccessStaticSelection(schemaPlan)
		assertAccessExplicitSelection(request, this.#plan, schemaPlan, permitted)
		return immutableRecord({
			...(rowFilter === undefined ? {} : { rowFilter }),
			...(permitted === undefined ? {} : { selectionFields: permitted }),
		})
	}

	async reevaluate<const TOperation extends DatabaseOperationAst>(
		request: RuntimeOperationStageInput<TOperation>,
	): Promise<boolean> {
		const accessRequest = request as unknown as AccessRuntimeRequest
		if (isSchemaMutationAccessRequest(accessRequest)) return true
		const schemaPlan = this.#readSchemaPlan(accessRequest.operation)

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
		const { source, fieldPath } = request.relation
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
			allowUndeclaredFieldAccess,
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
		const accessRequest = request as unknown as AccessRuntimeRequest
		if (isSchemaMutationAccessRequest(accessRequest)) {
			return enforceSchemaMutationItemAccess(
				this.#runtime,
				accessRequest,
				this.#readSchemaPlan(accessRequest.operation),
			)
		}
		return enforceAccessPreparedMutation(this.#runtime, this.#plan, request)
	}

	async enforceMutationOutcome<
		const TOperation extends DatabaseMutationOperationAst,
	>(
		request: RuntimeMutationOutcomeStageInput<TOperation>,
	): Promise<DatabaseOperationOutcome<TOperation>> {
		const accessRequest = request as unknown as AccessRuntimeRequest
		if (isSchemaMutationAccessRequest(accessRequest)) return request.outcome
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
		const accessRequest = request as unknown as AccessRuntimeRequest
		return enforceAccessOutput(
			this.#runtime,
			{ ...accessRequest, result: request.result },
			this.#plan,
			this.#readSchemaPlan(accessRequest.operation),
		)
	}
}
