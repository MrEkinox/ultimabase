import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'
import { assertExactEnumerablePlainObject } from '../../exact-object-validation.js'

import { Schema, type SchemaDefinition } from '../../schema/index.js'
import type { RequestContext } from '../context/request-context.js'
import type {
	DatabaseMutationOperationAst,
	DatabaseRowFilterNode,
} from '../database/contracts.js'
import type {
	RuntimeLogicalMutationOperationAst,
	RuntimeLogicalOperationAst,
	RuntimeLogicalOperationKind,
	RuntimeMutationOutcomeStageInput,
	RuntimeOperationStageInput,
	RuntimePreparedMutationStageInput,
	RuntimeRelationEnforcementStageInput,
	RuntimeResultStageInput,
} from '../pipeline/contracts.js'
import { normalizeRuntimeOperationKinds } from '../operations/characteristics.js'
import { assertMasterMode } from './definitions.js'

/** Describes only monotonic effects Core may append to protected request state. */
export interface ProtectedPolicyEffects {
	/** False denies the request; true and omission cannot override an earlier denial. */
	readonly allowed?: boolean
	/** Intersects fields accepted by mutation input. */
	readonly inputFields?: readonly string[]
	/** ANDs one private row predicate outside the developer operation. */
	readonly rowFilter?: DatabaseRowFilterNode
	/** Intersects fields visible to selection and business result middleware. */
	readonly selectionFields?: readonly string[]
}

/** Evaluates an operation before business middleware receives it. */
export type ProtectedPolicyEvaluate = <
	const TOperation extends RuntimeLogicalOperationAst,
>(
	input: RuntimeOperationStageInput<TOperation>,
) => MaybePromise<ProtectedPolicyEffects | undefined>

/** Rechecks transformed operation values without receiving accumulated policy state. */
export type ProtectedPolicyReevaluate = <
	const TOperation extends RuntimeLogicalOperationAst,
>(
	input: RuntimeOperationStageInput<TOperation>,
) => MaybePromise<boolean | undefined>

/** Authorizes one source relationship before its target query can execute. */
export type ProtectedPolicyRelationGuard = <
	const TOperation extends RuntimeLogicalOperationAst,
>(
	input: RuntimeRelationEnforcementStageInput<TOperation>,
) => MaybePromise<boolean | undefined>

/** Authorizes one stable mutation target before persistence. */
export type ProtectedPolicyPreparedMutationGuard = <
	const TOperation extends RuntimeLogicalMutationOperationAst,
	const TTarget,
>(
	input: RuntimePreparedMutationStageInput<TOperation, TTarget>,
) => MaybePromise<boolean | undefined>

/** Authorizes the actual mutation branch and its complete materialization. */
export type ProtectedPolicyMutationOutcomeGuard = <
	const TOperation extends RuntimeLogicalMutationOperationAst,
	const TOutcome,
>(
	input: RuntimeMutationOutcomeStageInput<TOperation, TOutcome>,
) => MaybePromise<boolean | undefined>

/** Returns only a structural subset of the final result received by the policy. */
export type ProtectedPolicyResultRestriction = <
	const TOperation extends RuntimeLogicalOperationAst,
	const TResult,
>(
	input: RuntimeResultStageInput<TOperation, TResult>,
) => MaybePromise<TResult | undefined>

/** What a policy receives when Core asks whether a caller holds one schema permission. */
export interface ProtectedPolicyPermissionInput {
	readonly context: RequestContext
	/** The declared permission name, for example `readDeleted`. */
	readonly permission: string
	readonly schema: SchemaDefinition
}

/**
 * Answers whether the caller holds one declared schema permission (ADR-0317):
 * `true` grants, `false` refuses whatever other policies answer, `undefined`
 * gives no answer. Core never asks it for Master, which holds every permission.
 */
export type ProtectedPolicyPermission = (
	input: ProtectedPolicyPermissionInput,
) => MaybePromise<boolean | undefined>

/** Configures one application-local protected policy without exposing Core state. */
export interface ProtectedPolicyOptions<
	TSchema extends SchemaDefinition = SchemaDefinition,
	TOperations extends readonly RuntimeLogicalOperationKind[] =
		readonly RuntimeLogicalOperationKind[],
> {
	/** Limits the policy to one exact application-owned schema. */
	readonly schema?: TSchema
	/** Limits the policy to a non-empty set of logical operation terminals. */
	readonly operations?: TOperations
	/** Selects whether trusted Master skips this complete independent policy. */
	readonly master?: 'bypass' | 'enforce'
	readonly evaluate?: ProtectedPolicyEvaluate
	readonly reevaluate?: ProtectedPolicyReevaluate
	readonly relation?: ProtectedPolicyRelationGuard
	readonly preparedMutation?: ProtectedPolicyPreparedMutationGuard
	readonly mutationOutcome?: ProtectedPolicyMutationOutcomeGuard
	readonly restrictResult?: ProtectedPolicyResultRestriction
	/** Answers schema permission questions such as `readDeleted` (ADR-0317). */
	readonly permission?: ProtectedPolicyPermission
	/** Requests stable set-based preimages only when this policy consumes them. */
	readonly requiresPreparedMutationItems?: (
		operation: DatabaseMutationOperationAst,
	) => boolean
}

declare const protectedPolicyDefinitionType: unique symbol

/** Retains inert matching metadata while executable handlers remain private. */
export interface ProtectedPolicyDefinition<
	TSchema extends SchemaDefinition = SchemaDefinition,
	TOperationKind extends RuntimeLogicalOperationKind =
		RuntimeLogicalOperationKind,
> {
	readonly kind: 'protected-policy'
	readonly schema: TSchema | undefined
	readonly operations: readonly TOperationKind[] | undefined
	readonly [protectedPolicyDefinitionType]?: true
}

/** Supplies Core's enforcement composer with one validated protected policy. */
export interface ProtectedPolicyImplementation {
	readonly kind: 'protected-policy'
	readonly master: 'bypass' | 'enforce'
	readonly schema: SchemaDefinition | undefined
	readonly operations: readonly RuntimeLogicalOperationKind[] | undefined
	readonly evaluate: ProtectedPolicyEvaluate | undefined
	readonly reevaluate: ProtectedPolicyReevaluate | undefined
	readonly relation: ProtectedPolicyRelationGuard | undefined
	readonly preparedMutation: ProtectedPolicyPreparedMutationGuard | undefined
	readonly mutationOutcome: ProtectedPolicyMutationOutcomeGuard | undefined
	readonly restrictResult: ProtectedPolicyResultRestriction | undefined
	readonly permission: ProtectedPolicyPermission | undefined
	readonly requiresPreparedMutationItems:
		((operation: DatabaseMutationOperationAst) => boolean) | undefined
}

const implementations = new WeakMap<object, ProtectedPolicyImplementation>()
const handlerKeys = [
	'evaluate',
	'mutationOutcome',
	'permission',
	'preparedMutation',
	'reevaluate',
	'relation',
	'requiresPreparedMutationItems',
	'restrictResult',
] as const
const optionKeys = new Set<string>([
	...handlerKeys,
	'master',
	'operations',
	'schema',
])

/** Declares a product-neutral policy whose outputs Core can only accumulate. */
export const protectedPolicy = <
	const TSchema extends SchemaDefinition = SchemaDefinition,
	const TOperations extends readonly RuntimeLogicalOperationKind[] =
		readonly RuntimeLogicalOperationKind[],
>(
	options: ProtectedPolicyOptions<TSchema, TOperations>,
): ProtectedPolicyDefinition<TSchema, TOperations[number]> => {
	const candidate: unknown = options

	assertExactEnumerablePlainObject(
		candidate,
		optionKeys,
		'protected policy options must be a plain object',
		'protected policy contains unknown key: ',
	)
	if (options.schema !== undefined && !Schema.is(options.schema)) {
		throw new TypeError('protected policy schema must be a schema definition')
	}
	assertMasterMode(candidate.master, 'protected policy')

	const handlers = handlerKeys.filter((key) => {
		const handler: unknown = options[key]
		if (handler !== undefined && typeof handler !== 'function') {
			throw new TypeError(`protected policy ${key} must be a function`)
		}
		return handler !== undefined
	})
	if (handlers.length === 0) {
		throw new TypeError('protected policy must declare at least one handler')
	}

	const operations = normalizeRuntimeOperationKinds(
		options.operations,
		'enforcement',
	)
	const definition = immutableRecord({
		kind: 'protected-policy' as const,
		operations,
		schema: options.schema,
	})

	implementations.set(
		definition,
		immutableRecord({
			evaluate: options.evaluate,
			kind: 'protected-policy' as const,
			master: options.master ?? 'enforce',
			mutationOutcome: options.mutationOutcome,
			operations,
			permission: options.permission,
			preparedMutation: options.preparedMutation,
			reevaluate: options.reevaluate,
			relation: options.relation,
			requiresPreparedMutationItems: options.requiresPreparedMutationItems,
			restrictResult: options.restrictResult,
			schema: options.schema,
		}),
	)

	return definition
}

/** Resolves only definitions created by `protectedPolicy()`. */
export const getProtectedPolicyImplementation = (
	value: unknown,
): ProtectedPolicyImplementation | undefined =>
	typeof value === 'object' && value !== null
		? implementations.get(value)
		: undefined

const effectKeys = new Set([
	'allowed',
	'inputFields',
	'rowFilter',
	'selectionFields',
])

/** Rejects widened or executable effect containers before Core applies them. */
export const normalizeProtectedPolicyEffects = (
	value: unknown,
): ProtectedPolicyEffects => {
	assertExactEnumerablePlainObject(
		value,
		effectKeys,
		'protected policy effects must be a plain object',
		'protected policy effects contain unknown key: ',
	)
	if (value.allowed !== undefined && typeof value.allowed !== 'boolean') {
		throw new TypeError('protected policy allowed must be a boolean')
	}
	for (const key of ['inputFields', 'selectionFields'] as const) {
		const fields: unknown = value[key]
		if (fields !== undefined && !isUnknownArray(fields)) {
			throw new TypeError(`protected policy ${key} must be an array`)
		}
	}

	return immutableRecord({
		...(value.allowed === undefined ? {} : { allowed: value.allowed }),
		...(value.inputFields === undefined
			? {}
			: {
					inputFields: immutableArray(value.inputFields as readonly string[]),
				}),
		...(value.rowFilter === undefined
			? {}
			: { rowFilter: value.rowFilter as DatabaseRowFilterNode }),
		...(value.selectionFields === undefined
			? {}
			: {
					selectionFields: immutableArray(
						value.selectionFields as readonly string[],
					),
				}),
	})
}
