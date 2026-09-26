import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'
import { assertExactEnumerableKeys } from '../../exact-object-validation.js'

import type { OperationKind } from '../../query/index.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import type {
	DatabaseConstraintNode,
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
	DatabaseRowFilterNode,
} from '../database/contracts.js'
import type {
	RuntimeMutationOutcomeStageInput,
	RuntimeOperationResult,
	RuntimeOperationStageInput,
	RuntimePreparedMutationStageInput,
	RuntimeRelationEnforcementStageInput,
	RuntimeResultStageInput,
} from '../pipeline/contracts.js'
import { normalizeEnforcementOperations } from './definitions.js'

/** Describes only monotonic effects Core may append to protected request state. */
export interface ProtectedPolicyEffects {
	/** False denies the request; true and omission cannot override an earlier denial. */
	readonly allowed?: boolean
	/** Appends opaque adapter constraints in declaration order. */
	readonly constraints?:
		DatabaseConstraintNode | readonly DatabaseConstraintNode[]
	/** Intersects fields accepted by mutation input. */
	readonly inputFields?: readonly string[]
	/** ANDs one private row predicate outside the developer operation. */
	readonly rowFilter?: DatabaseRowFilterNode
	/** Intersects fields visible to selection and business result middleware. */
	readonly selectionFields?: readonly string[]
}

/** Evaluates an operation before business middleware receives it. */
export type ProtectedPolicyEvaluate = <
	const TOperation extends DatabaseOperationAst,
>(
	input: RuntimeOperationStageInput<TOperation>,
) => MaybePromise<ProtectedPolicyEffects | undefined>

/** Rechecks transformed operation values without receiving accumulated policy state. */
export type ProtectedPolicyReevaluate = <
	const TOperation extends DatabaseOperationAst,
>(
	input: RuntimeOperationStageInput<TOperation>,
) => MaybePromise<boolean | undefined>

/** Authorizes one source relationship before its target query can execute. */
export type ProtectedPolicyRelationGuard = <
	const TOperation extends DatabaseOperationAst,
>(
	input: RuntimeRelationEnforcementStageInput<TOperation>,
) => MaybePromise<boolean | undefined>

/** Authorizes one stable mutation target before persistence. */
export type ProtectedPolicyPreparedMutationGuard = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	input: RuntimePreparedMutationStageInput<TOperation>,
) => MaybePromise<boolean | undefined>

/** Authorizes the actual mutation branch and its complete materialization. */
export type ProtectedPolicyMutationOutcomeGuard = <
	const TOperation extends DatabaseMutationOperationAst,
>(
	input: RuntimeMutationOutcomeStageInput<TOperation>,
) => MaybePromise<boolean | undefined>

/** Returns only a structural subset of the final result received by the policy. */
export type ProtectedPolicyResultRestriction = <
	const TOperation extends DatabaseOperationAst,
>(
	input: RuntimeResultStageInput<TOperation>,
) => MaybePromise<RuntimeOperationResult<TOperation> | undefined>

/** Configures one application-local protected policy without exposing Core state. */
export interface ProtectedPolicyOptions<
	TSchema extends SchemaDefinition = SchemaDefinition,
	TOperations extends readonly OperationKind[] = readonly OperationKind[],
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
	/** Requests stable set-based preimages only when this policy consumes them. */
	readonly requiresPreparedMutationItems?: (
		operation: DatabaseMutationOperationAst,
	) => boolean
}

declare const protectedPolicyDefinitionType: unique symbol

/** Retains inert matching metadata while executable handlers remain private. */
export interface ProtectedPolicyDefinition<
	TSchema extends SchemaDefinition = SchemaDefinition,
	TOperationKind extends OperationKind = OperationKind,
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
	readonly operations: readonly OperationKind[] | undefined
	readonly evaluate: ProtectedPolicyEvaluate | undefined
	readonly reevaluate: ProtectedPolicyReevaluate | undefined
	readonly relation: ProtectedPolicyRelationGuard | undefined
	readonly preparedMutation: ProtectedPolicyPreparedMutationGuard | undefined
	readonly mutationOutcome: ProtectedPolicyMutationOutcomeGuard | undefined
	readonly restrictResult: ProtectedPolicyResultRestriction | undefined
	readonly requiresPreparedMutationItems:
		((operation: DatabaseMutationOperationAst) => boolean) | undefined
}

const implementations = new WeakMap<object, ProtectedPolicyImplementation>()
const optionKeys = new Set([
	'evaluate',
	'master',
	'mutationOutcome',
	'operations',
	'preparedMutation',
	'reevaluate',
	'relation',
	'requiresPreparedMutationItems',
	'restrictResult',
	'schema',
])
const handlerKeys = [
	'evaluate',
	'mutationOutcome',
	'preparedMutation',
	'reevaluate',
	'relation',
	'requiresPreparedMutationItems',
	'restrictResult',
] as const

/** Declares a product-neutral policy whose outputs Core can only accumulate. */
export const protectedPolicy = <
	const TSchema extends SchemaDefinition = SchemaDefinition,
	const TOperations extends readonly OperationKind[] = readonly OperationKind[],
>(
	options: ProtectedPolicyOptions<TSchema, TOperations>,
): ProtectedPolicyDefinition<TSchema, TOperations[number]> => {
	const candidate: unknown = options

	if (!isPlainRecord(candidate)) {
		throw new TypeError('protected policy options must be a plain object')
	}

	for (const key of Object.keys(candidate)) {
		if (!optionKeys.has(key)) {
			throw new TypeError(`protected policy contains unknown key: ${key}`)
		}
	}

	if (options.schema !== undefined && !Schema.is(options.schema)) {
		throw new TypeError('protected policy schema must be a schema definition')
	}
	const master: unknown = candidate.master
	if (master !== undefined && master !== 'bypass' && master !== 'enforce') {
		throw new TypeError('protected policy master must be bypass or enforce')
	}

	let handlerCount = 0
	for (const key of handlerKeys) {
		const handler: unknown = options[key]
		if (handler === undefined) continue
		if (typeof handler !== 'function') {
			throw new TypeError(`protected policy ${key} must be a function`)
		}
		handlerCount += 1
	}
	if (handlerCount === 0) {
		throw new TypeError('protected policy must declare at least one handler')
	}

	const operations = normalizeEnforcementOperations(options.operations)
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
	'constraints',
	'inputFields',
	'rowFilter',
	'selectionFields',
])

/** Rejects widened or executable effect containers before Core applies them. */
export const normalizeProtectedPolicyEffects = (
	value: unknown,
): ProtectedPolicyEffects => {
	if (!isPlainRecord(value)) {
		throw new TypeError('protected policy effects must be a plain object')
	}
	assertExactEnumerableKeys(
		value,
		effectKeys,
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
		...(value.constraints === undefined
			? {}
			: {
					constraints: value.constraints as NonNullable<
						ProtectedPolicyEffects['constraints']
					>,
				}),
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

/** Matches inert schema and operation metadata without invoking one policy. */
export const matchesProtectedPolicy = (
	implementation: ProtectedPolicyImplementation,
	operation: { readonly kind: OperationKind },
	schema: SchemaDefinition,
): boolean =>
	(implementation.operations === undefined ||
		implementation.operations.includes(operation.kind)) &&
	(implementation.schema === undefined || implementation.schema === schema)
