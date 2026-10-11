import {
	createRuntimeBehaviorBoundaries,
	readPolicyQuery,
	readRuntimePreparedMutationRecords,
	type DatabaseMutationOperationAst,
	type ProtectedPolicyEffects,
	type RuntimeBehaviorBoundaries,
	type RuntimeLogicalMutationOperationAst,
	type RuntimeLogicalOperationAst,
	type RuntimeMutationOutcomeStageInput,
	type RuntimeOperationStageInput,
	type RuntimePreparedMutationStageInput,
	type RuntimeRelationEnforcementStageInput,
	type RuntimeResultStageInput,
} from '@ultimabase/core'
import { immutableRecord } from '@ultimabase/shared'

import type { AccessPlan } from '../authoring/plan.js'
import type { AccessDiagnosticsObserver } from './diagnostics.js'
import { AccessExecutionRuntime } from './execution-runtime.js'
import {
	enforceAccessPreparedMutation,
	enforceAccessUpsertOutcome,
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
	assertAccessRules,
	createAccessScope,
	readPolicyOperation,
	enforceSchemaMutationItemAccess,
	evaluateAccessFieldReferenceRules,
	evaluateAccessOperation,
	evaluateSchemaMutationAccess,
	readExecutableOperation,
	type AccessScope,
} from './rule-evaluation.js'
import type {
	RequestContext,
	ApplicationCallbackExecutor,
} from '@ultimabase/core/plugin'

/**
 * Executes one application's immutable official Access plan at Runtime
 * boundaries. Guards resolve to `true` and signal denial by throwing
 * `PERMISSION_DENIED`, which the protected policy adapter turns into `false`.
 */
export class AccessRuntime {
	readonly #boundaries: RuntimeBehaviorBoundaries =
		createRuntimeBehaviorBoundaries()
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

	#scope(
		context: RequestContext,
		operation: RuntimeLogicalOperationAst,
	): AccessScope {
		return createAccessScope(this.#runtime, this.#plan, context, operation)
	}

	async evaluate<const TOperation extends RuntimeLogicalOperationAst>(
		request: RuntimeOperationStageInput<TOperation>,
	): Promise<ProtectedPolicyEffects> {
		const operation: RuntimeLogicalOperationAst = request.operation
		const scope = this.#scope(request.context, operation)
		let rowFilter
		if (operation.kind === 'plugin-schema-mutation') {
			rowFilter = await evaluateSchemaMutationAccess(scope, operation)
		} else {
			rowFilter = await evaluateAccessOperation(scope, operation.kind)
			// `can()` carries no input or selection: field rules do not apply,
			// and create items run only on the candidate data it received.
			const query = readPolicyQuery(operation)
			if (query === undefined) {
				// Native field transitions and create-item checks belong only to CRUD.
				await evaluateAccessFieldReferenceRules(scope, operation)
				await evaluateAccessMutationFieldRules(
					scope,
					operation,
					request.nestedWrite,
				)
			}
			if (query === undefined || query.item) {
				await evaluateAccessCreateItems(scope, operation)
			}
		}

		const selectionFields = computeAccessStaticSelection(scope.schemaPlan)
		assertAccessExplicitSelection(scope, operation, selectionFields)
		return immutableRecord({
			...(rowFilter === undefined ? {} : { rowFilter }),
			...(selectionFields === undefined ? {} : { selectionFields }),
		})
	}

	async reevaluate<const TOperation extends RuntimeLogicalOperationAst>(
		request: RuntimeOperationStageInput<TOperation>,
	): Promise<true> {
		const operation: RuntimeLogicalOperationAst = request.operation
		if (operation.kind === 'plugin-schema-mutation') return true
		const scope = this.#scope(request.context, operation)
		await evaluateAccessMutationFieldRules(
			scope,
			operation,
			request.nestedWrite,
		)
		await evaluateAccessCreateItems(scope, operation)
		return true
	}

	/** Enforces one relation source field absent from persisted row output. */
	async enforceRelationRead(
		request: RuntimeRelationEnforcementStageInput,
	): Promise<true> {
		const { source, fieldPath } = request.relation
		const field = this.#plan.getField(source, fieldPath)

		// Pointer predicates are checked through their ordinary `where` channel;
		// this guard owns only source relation handles that have no row value.
		if (field?.field.kind === 'pointer') return true
		if (field?.field.kind !== 'relation') {
			throw new TypeError('Native Access relation field is unavailable')
		}
		await assertAccessRules(
			{
				context: request.context,
				operation: request.operation.kind,
				policyOperation: readPolicyOperation(request.operation),
				runtime: this.#runtime,
				schema: source,
			},
			field.read.item,
			{ branch: 'item', field, phase: 'access-field-read' },
			immutableRecord({ context: request.context }),
		)
		return true
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
	): Promise<true> {
		const operation: RuntimeLogicalMutationOperationAst = request.operation
		if (operation.kind === 'plugin-schema-mutation') {
			await enforceSchemaMutationItemAccess(
				this.#scope(request.context, operation),
				operation,
			)
		} else {
			await enforceAccessPreparedMutation(
				this.#runtime,
				this.#plan,
				request.context,
				operation,
				readRuntimePreparedMutationRecords(request),
			)
		}
		return true
	}

	async enforceMutationOutcome<
		const TOperation extends RuntimeLogicalMutationOperationAst,
		const TOutcome,
	>(
		request: RuntimeMutationOutcomeStageInput<TOperation, TOutcome>,
	): Promise<true> {
		const operation: RuntimeLogicalMutationOperationAst = request.operation
		if (operation.kind === 'plugin-schema-mutation') return true
		const executable = readExecutableOperation(operation)
		if (executable.kind !== 'upsert-one' && executable.kind !== 'upsert-many') {
			return true
		}
		const outcome = this.#boundaries.snapshotMutationOutcome(
			operation,
			request.outcome,
			request.selectedFieldsOverride,
		)
		await enforceAccessUpsertOutcome(
			this.#scope(request.context, operation),
			executable,
			outcome,
		)
		return true
	}

	async enforceOutput<
		const TOperation extends RuntimeLogicalOperationAst,
		const TResult,
	>(request: RuntimeResultStageInput<TOperation, TResult>): Promise<TResult> {
		return enforceAccessOutput(
			this.#scope(request.context, request.operation),
			request.result,
		)
	}
}
