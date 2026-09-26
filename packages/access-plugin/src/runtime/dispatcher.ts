import { immutableRecord } from '@ultimabase/shared'
import type {
	ApplicationCallbackExecutor,
	DatabaseMutationOperationAst,
	ProtectedPolicyEffects,
	RuntimeBehaviorBoundaries,
	RuntimeLogicalOperationAst,
	RuntimeLogicalMutationOperationAst,
	RuntimeMutationOutcomeStageInput,
	RuntimeOperationStageInput,
	RuntimePreparedMutationStageInput,
	RuntimeRelationEnforcementStageInput,
} from '@ultimabase/core'
import {
	createRuntimeBehaviorBoundaries,
	readRuntimePreparedMutationRecords,
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
	readNativeAccessRequest,
	readAccessSchema,
	type AccessRuntimeRequest,
} from './rule-evaluation.js'
import {
	enforceSchemaMutationItemAccess,
	evaluateSchemaMutationAccess,
	isSchemaMutationAccessRequest,
} from './schema-mutation-access.js'

const readNativeMutationOperation = (
	operation: RuntimeLogicalMutationOperationAst,
): DatabaseMutationOperationAst => {
	if (operation.kind === 'plugin-schema-mutation') {
		throw new TypeError('Native Access requires a database mutation')
	}

	return operation
}

/** Executes one application's immutable official Access plan at Runtime boundaries. */
export class AccessRuntime {
	readonly #boundaries: RuntimeBehaviorBoundaries
	readonly #plan: AccessPlan
	readonly #runtime: AccessExecutionRuntime

	constructor(
		plan: AccessPlan,
		observer?: AccessDiagnosticsObserver,
		callbacks?: ApplicationCallbackExecutor,
	) {
		this.#boundaries = createRuntimeBehaviorBoundaries()
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

	async evaluate<const TOperation extends RuntimeLogicalOperationAst>(
		request: RuntimeOperationStageInput<TOperation>,
	): Promise<ProtectedPolicyEffects> {
		const accessRequest: AccessRuntimeRequest = request
		const schemaPlan = this.#readSchemaPlan(accessRequest.operation)

		const schemaMutation = isSchemaMutationAccessRequest(accessRequest)
		let rowFilter
		if (schemaMutation) {
			rowFilter = await evaluateSchemaMutationAccess(
				this.#runtime,
				accessRequest,
				this.#plan,
				schemaPlan,
			)
		} else {
			const nativeRequest = readNativeAccessRequest(accessRequest)
			rowFilter = await evaluateAccessOperationAndFilter(
				this.#runtime,
				nativeRequest,
				this.#plan,
				schemaPlan,
			)

			// Native field transitions and create-item checks belong only to CRUD.
			await evaluateAccessFieldReferenceRules(
				this.#runtime,
				nativeRequest,
				this.#plan,
				schemaPlan,
			)
			await evaluateAccessMutationFieldRules(
				this.#runtime,
				nativeRequest,
				this.#plan,
				schemaPlan,
			)
			await evaluateAccessCreateItems(this.#runtime, nativeRequest, schemaPlan)
		}

		const permitted = computeAccessStaticSelection(schemaPlan)
		assertAccessExplicitSelection(request, this.#plan, schemaPlan, permitted)
		return immutableRecord({
			...(rowFilter === undefined ? {} : { rowFilter }),
			...(permitted === undefined ? {} : { selectionFields: permitted }),
		})
	}

	async reevaluate<const TOperation extends RuntimeLogicalOperationAst>(
		request: RuntimeOperationStageInput<TOperation>,
	): Promise<boolean> {
		const accessRequest: AccessRuntimeRequest = request
		if (isSchemaMutationAccessRequest(accessRequest)) return true
		const schemaPlan = this.#readSchemaPlan(accessRequest.operation)
		const nativeRequest = readNativeAccessRequest(accessRequest)

		await evaluateAccessMutationFieldRules(
			this.#runtime,
			nativeRequest,
			this.#plan,
			schemaPlan,
		)
		await evaluateAccessCreateItems(this.#runtime, nativeRequest, schemaPlan)

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
		const TOperation extends RuntimeLogicalMutationOperationAst,
		const TTarget,
	>(
		request: RuntimePreparedMutationStageInput<TOperation, TTarget>,
	): Promise<void> {
		const accessRequest: AccessRuntimeRequest = request
		if (isSchemaMutationAccessRequest(accessRequest)) {
			return enforceSchemaMutationItemAccess(
				this.#runtime,
				accessRequest,
				this.#readSchemaPlan(accessRequest.operation),
			)
		}
		const { targets, ...requestWithoutTargets } = request

		return enforceAccessPreparedMutation(
			this.#runtime,
			this.#plan,
			immutableRecord({
				...requestWithoutTargets,
				...readRuntimePreparedMutationRecords({
					target: request.target,
					targets,
				}),
				operation: readNativeMutationOperation(request.operation),
			}),
		)
	}

	async enforceMutationOutcome<
		const TOperation extends RuntimeLogicalMutationOperationAst,
		const TOutcome,
	>(
		request: RuntimeMutationOutcomeStageInput<TOperation, TOutcome>,
	): Promise<void> {
		const accessRequest: AccessRuntimeRequest = request
		if (isSchemaMutationAccessRequest(accessRequest)) return
		const operation = readNativeMutationOperation(request.operation)
		const outcome = this.#boundaries.snapshotMutationOutcome(
			operation,
			request.outcome,
			request.selectedFieldsOverride,
		)

		await enforceAccessMutationOutcome(this.#runtime, this.#plan, {
			...request,
			operation,
			outcome,
		})
	}

	async enforceOutput<
		const TOperation extends RuntimeLogicalOperationAst,
		const TResult,
	>(
		request: RuntimeOperationStageInput<TOperation> & {
			readonly result: TResult
		},
	): Promise<TResult> {
		const accessRequest: AccessRuntimeRequest = request
		return enforceAccessOutput(
			this.#runtime,
			{ ...accessRequest, result: request.result },
			this.#plan,
			this.#readSchemaPlan(accessRequest.operation),
		)
	}
}
