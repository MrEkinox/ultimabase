import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'
import { assertExactEnumerableKeys } from '../../exact-object-validation.js'

import {
	assertDatabaseConstraintKind,
	assertDatabaseConstraintVersion,
} from '../../plugins/constraint-compilers.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import type {
	DatabaseConstraintNode,
	EnforcementConstraintHandler,
	EnforcementContributionKind,
	EnforcementFieldRestrictionHandler,
	EnforcementGuardHandler,
	EnforcementOperationInput,
	EnforcementOutputInput,
	EnforcementOutputRestrictionHandler,
} from './contracts.js'
import type {
	DatabaseConstraintPayload,
	ImmutableDatabaseConstraintPayload,
} from '../database/contracts.js'
import type { RuntimeLogicalOperationKind } from '../pipeline/contracts.js'

const operationKinds = new Set<RuntimeLogicalOperationKind>([
	'find-many',
	'find-one',
	'get',
	'count',
	'exists',
	'create-one',
	'create-many',
	'update-one',
	'update-many',
	'upsert-one',
	'upsert-many',
	'delete-one',
	'delete-many',
	'plugin-schema-mutation',
])

interface EnforcementOptions<
	TSchema extends SchemaDefinition,
	TOperations extends readonly RuntimeLogicalOperationKind[],
	THandler,
> {
	/**
	 * Limits the contribution to this exact schema identity.
	 * Omit it to apply the handler to every schema owned by the application.
	 */
	readonly schema?: TSchema
	/**
	 * Limits the contribution to a non-empty list of terminal operation kinds.
	 * Omit it to match every read and mutation terminal.
	 */
	readonly operations?: TOperations
	/**
	 * Selects whether trusted master execution skips this contribution entirely.
	 * Omission keeps the contribution enforced so bypass stays explicit per provider.
	 */
	readonly master?: 'bypass' | 'enforce'
	/**
	 * Evaluates trusted context and exact operation data without receiving another
	 * plugin's accumulated enforcement state.
	 */
	readonly handler: THandler
}

/** Configures one deny-only operation guard. */
export type GuardOptions<
	TSchema extends SchemaDefinition,
	TOperations extends readonly RuntimeLogicalOperationKind[],
> = EnforcementOptions<
	TSchema,
	TOperations,
	EnforcementGuardHandler<TSchema, TOperations[number]>
>

/** Configures opaque constraints that Runtime appends for the selected adapter. */
export type ConstraintOptions<
	TSchema extends SchemaDefinition,
	TOperations extends readonly RuntimeLogicalOperationKind[],
	TConstraint extends DatabaseConstraintNode,
> = EnforcementOptions<
	TSchema,
	TOperations,
	EnforcementConstraintHandler<TSchema, TOperations[number], TConstraint>
>

/** Configures a monotonic mutation-input field restriction. */
export type InputRestrictionOptions<
	TSchema extends SchemaDefinition,
	TOperations extends readonly RuntimeLogicalOperationKind[],
> = EnforcementOptions<
	TSchema,
	TOperations,
	EnforcementFieldRestrictionHandler<TSchema, TOperations[number]>
>

/** Configures a monotonic query-selection field restriction. */
export type SelectionRestrictionOptions<
	TSchema extends SchemaDefinition,
	TOperations extends readonly RuntimeLogicalOperationKind[],
> = EnforcementOptions<
	TSchema,
	TOperations,
	EnforcementFieldRestrictionHandler<TSchema, TOperations[number]>
>

/** Configures the final field restriction after every result transform. */
export type OutputRestrictionOptions<
	TSchema extends SchemaDefinition,
	TOperations extends readonly RuntimeLogicalOperationKind[],
> = EnforcementOptions<
	TSchema,
	TOperations,
	EnforcementOutputRestrictionHandler<TSchema, TOperations[number]>
>

declare const enforcementDefinitionType: unique symbol

/** Retains matching metadata while keeping the executable handler private. */
export interface EnforcementDefinition<
	TKind extends EnforcementContributionKind = EnforcementContributionKind,
	TSchema extends SchemaDefinition = SchemaDefinition,
	TOperationKind extends RuntimeLogicalOperationKind =
		RuntimeLogicalOperationKind,
	THandler = unknown,
> {
	readonly kind: TKind
	readonly schema: TSchema | undefined
	readonly operations: readonly TOperationKind[] | undefined
	readonly [enforcementDefinitionType]?: THandler
}

/** Represents a provenance-free deny-only guard declaration. */
export type GuardDefinition<
	TSchema extends SchemaDefinition = SchemaDefinition,
	TOperationKind extends RuntimeLogicalOperationKind =
		RuntimeLogicalOperationKind,
> = EnforcementDefinition<
	'guard',
	TSchema,
	TOperationKind,
	EnforcementGuardHandler<TSchema, TOperationKind>
>

/** Represents a provenance-free opaque adapter-constraint declaration. */
export type ConstraintDefinition<
	TSchema extends SchemaDefinition = SchemaDefinition,
	TOperationKind extends RuntimeLogicalOperationKind =
		RuntimeLogicalOperationKind,
	TConstraint extends DatabaseConstraintNode = DatabaseConstraintNode,
> = EnforcementDefinition<
	'constraint',
	TSchema,
	TOperationKind,
	EnforcementConstraintHandler<TSchema, TOperationKind, TConstraint>
>

/** Represents a provenance-free mutation-input restriction declaration. */
export type InputRestrictionDefinition<
	TSchema extends SchemaDefinition = SchemaDefinition,
	TOperationKind extends RuntimeLogicalOperationKind =
		RuntimeLogicalOperationKind,
> = EnforcementDefinition<
	'restrictInput',
	TSchema,
	TOperationKind,
	EnforcementFieldRestrictionHandler<TSchema, TOperationKind>
>

/** Represents a provenance-free query-selection restriction declaration. */
export type SelectionRestrictionDefinition<
	TSchema extends SchemaDefinition = SchemaDefinition,
	TOperationKind extends RuntimeLogicalOperationKind =
		RuntimeLogicalOperationKind,
> = EnforcementDefinition<
	'restrictSelection',
	TSchema,
	TOperationKind,
	EnforcementFieldRestrictionHandler<TSchema, TOperationKind>
>

/** Represents a provenance-free final-output restriction declaration. */
export type OutputRestrictionDefinition<
	TSchema extends SchemaDefinition = SchemaDefinition,
	TOperationKind extends RuntimeLogicalOperationKind =
		RuntimeLogicalOperationKind,
> = EnforcementDefinition<
	'restrictOutput',
	TSchema,
	TOperationKind,
	EnforcementOutputRestrictionHandler<TSchema, TOperationKind>
>

export type EnforcementDefinitionUnion =
	| ConstraintDefinition
	| GuardDefinition
	| InputRestrictionDefinition
	| OutputRestrictionDefinition
	| SelectionRestrictionDefinition

type ErasedEnforcementHandler = (
	input: EnforcementOperationInput<never> | EnforcementOutputInput<never>,
) => MaybePromise<unknown>

/** Supplies Runtime with the handler paired to a validated public definition. */
export interface EnforcementContributionImplementation {
	readonly kind: EnforcementContributionKind
	readonly master: 'bypass' | 'enforce'
	readonly schema: SchemaDefinition | undefined
	readonly operations: readonly RuntimeLogicalOperationKind[] | undefined
	run(
		input: EnforcementOperationInput<never> | EnforcementOutputInput<never>,
	): MaybePromise<unknown>
}

const implementations = new WeakMap<
	object,
	EnforcementContributionImplementation
>()
const databaseConstraintNodes = new WeakSet<object>()
const optionKeys = new Set(['handler', 'master', 'operations', 'schema'])

/** Detaches portable payload data so retained caller references cannot alter a plan. */
const snapshotDatabaseConstraintPayload = (
	payload: unknown,
	path: string,
): DatabaseConstraintPayload => {
	if (
		payload === null ||
		typeof payload === 'bigint' ||
		typeof payload === 'boolean' ||
		typeof payload === 'string'
	) {
		return payload
	}

	if (typeof payload === 'number') {
		if (!Number.isFinite(payload)) {
			throw new TypeError(`${path} must contain only finite numbers`)
		}

		return payload
	}

	if (isUnknownArray(payload)) {
		return immutableArray(
			payload.map((value, index) =>
				snapshotDatabaseConstraintPayload(value, `${path}[${String(index)}]`),
			),
		)
	}

	if (isPlainRecord(payload)) {
		const snapshot: Record<string, DatabaseConstraintPayload> = {}

		for (const [key, value] of Object.entries(payload)) {
			snapshot[key] = snapshotDatabaseConstraintPayload(value, `${path}.${key}`)
		}

		return immutableRecord(snapshot)
	}

	throw new TypeError(
		`${path} must contain only portable scalar, array, and plain-object values`,
	)
}

/** Normalizes shared operation targeting for protected Runtime definitions. */
export const normalizeEnforcementOperations = (
	operations: readonly RuntimeLogicalOperationKind[] | undefined,
): readonly RuntimeLogicalOperationKind[] | undefined => {
	if (operations === undefined) {
		return undefined
	}

	const untrustedOperations: unknown = operations

	if (
		!isUnknownArray(untrustedOperations) ||
		untrustedOperations.length === 0
	) {
		throw new TypeError(
			'enforcement contribution operations must be a non-empty array',
		)
	}

	const normalized: RuntimeLogicalOperationKind[] = []

	for (const operation of untrustedOperations) {
		if (
			typeof operation !== 'string' ||
			!operationKinds.has(operation as RuntimeLogicalOperationKind)
		) {
			throw new TypeError(
				`Unknown enforcement operation kind: ${String(operation)}`,
			)
		}

		if (!normalized.includes(operation as RuntimeLogicalOperationKind)) {
			normalized.push(operation as RuntimeLogicalOperationKind)
		}
	}

	return immutableArray(normalized)
}

const assertOptions = (options: unknown): void => {
	if (!isPlainRecord(options)) {
		throw new TypeError(
			'enforcement contribution options must be a plain object',
		)
	}

	assertExactEnumerableKeys(
		options,
		optionKeys,
		'enforcement contribution contains unknown key: ',
	)

	if (typeof options.handler !== 'function') {
		throw new TypeError('enforcement contribution handler must be a function')
	}

	if (
		options.master !== undefined &&
		options.master !== 'bypass' &&
		options.master !== 'enforce'
	) {
		throw new TypeError(
			'enforcement contribution master must be bypass or enforce',
		)
	}

	if (options.schema !== undefined && !Schema.is(options.schema)) {
		throw new TypeError(
			'enforcement contribution schema must be a schema definition',
		)
	}
}

const defineEnforcement = <
	const TKind extends EnforcementContributionKind,
	const TSchema extends SchemaDefinition,
	const TOperations extends readonly RuntimeLogicalOperationKind[],
	THandler,
>(
	kind: TKind,
	options: EnforcementOptions<TSchema, TOperations, THandler>,
): EnforcementDefinition<TKind, TSchema, TOperations[number], THandler> => {
	const untrustedOptions: unknown = options
	assertOptions(untrustedOptions)

	const operations = normalizeEnforcementOperations(options.operations)
	const definition = immutableRecord({
		kind,
		operations,
		schema: options.schema,
	})
	const handler = options.handler as ErasedEnforcementHandler

	implementations.set(
		definition,
		immutableRecord({
			kind,
			master: options.master ?? 'enforce',
			operations,
			run: (input) => handler(input),
			schema: options.schema,
		}),
	)

	return definition
}

/**
 * Declares a guard that allows by returning nothing or denies by throwing.
 *
 * @example `guard({ schema: PostSchema, operations: ['create-one'], handler: ({ context }) => { if (context.access.mode === 'anonymous') throw denial } })`
 */
export const guard = <
	const TSchema extends SchemaDefinition = SchemaDefinition,
	const TOperations extends readonly RuntimeLogicalOperationKind[] =
		readonly RuntimeLogicalOperationKind[],
>(
	options: GuardOptions<TSchema, TOperations>,
): GuardDefinition<TSchema, TOperations[number]> =>
	defineEnforcement('guard', options)

/**
 * Declares opaque adapter constraints that Runtime can only append.
 *
 * @example `constraint({ schema: PostSchema, handler: () => databaseConstraint('tenant.rows', 1, { tenantId }) })`
 */
export const constraint = <
	const TSchema extends SchemaDefinition = SchemaDefinition,
	const TOperations extends readonly RuntimeLogicalOperationKind[] =
		readonly RuntimeLogicalOperationKind[],
	const TConstraint extends DatabaseConstraintNode = DatabaseConstraintNode,
>(
	options: ConstraintOptions<TSchema, TOperations, TConstraint>,
): ConstraintDefinition<TSchema, TOperations[number], TConstraint> =>
	defineEnforcement('constraint', options)

/**
 * Declares the permitted mutation-input fields for one independent policy.
 *
 * @example `restrictInput({ schema: PostSchema, handler: () => ['title'] })`
 */
export const restrictInput = <
	const TSchema extends SchemaDefinition = SchemaDefinition,
	const TOperations extends readonly RuntimeLogicalOperationKind[] =
		readonly RuntimeLogicalOperationKind[],
>(
	options: InputRestrictionOptions<TSchema, TOperations>,
): InputRestrictionDefinition<TSchema, TOperations[number]> =>
	defineEnforcement('restrictInput', options)

/**
 * Declares the permitted selected fields for one independent policy.
 *
 * @example `restrictSelection({ schema: PostSchema, handler: () => ['id', 'title'] })`
 */
export const restrictSelection = <
	const TSchema extends SchemaDefinition = SchemaDefinition,
	const TOperations extends readonly RuntimeLogicalOperationKind[] =
		readonly RuntimeLogicalOperationKind[],
>(
	options: SelectionRestrictionOptions<TSchema, TOperations>,
): SelectionRestrictionDefinition<TSchema, TOperations[number]> =>
	defineEnforcement('restrictSelection', options)

/**
 * Declares the permitted output fields after every result transformation.
 *
 * @example `restrictOutput({ schema: PostSchema, handler: () => ['id', 'title'] })`
 */
export const restrictOutput = <
	const TSchema extends SchemaDefinition = SchemaDefinition,
	const TOperations extends readonly RuntimeLogicalOperationKind[] =
		readonly RuntimeLogicalOperationKind[],
>(
	options: OutputRestrictionOptions<TSchema, TOperations>,
): OutputRestrictionDefinition<TSchema, TOperations[number]> =>
	defineEnforcement('restrictOutput', options)

/** Resolves only definitions created by the policy-neutral public factories. */
export const getEnforcementContributionImplementation = (
	value: unknown,
): EnforcementContributionImplementation | undefined =>
	typeof value === 'object' && value !== null
		? implementations.get(value)
		: undefined

/** Matches one contribution without exposing accumulated policy state. */
export const matchesEnforcementContribution = (
	implementation: EnforcementContributionImplementation,
	operation: { readonly kind: RuntimeLogicalOperationKind },
	schema: SchemaDefinition,
): boolean =>
	(implementation.operations === undefined ||
		implementation.operations.includes(operation.kind)) &&
	(implementation.schema === undefined || implementation.schema === schema)

/**
 * Creates one detached immutable payload for adapter constraint compilation.
 *
 * Kinds use lowercase dot-separated namespace segments. Payloads accept only
 * portable scalar, array, and plain-object values.
 *
 * @param kind - Names the adapter compiler contract, for example `tenant.rows`.
 * @param version - Selects the compiler's positive integer payload version.
 * @param payload - Supplies portable data interpreted only by the owning plugin.
 * @example `databaseConstraint('tenant.rows', 1, { tenantId: 'tenant-1' })`
 */
export const databaseConstraint = <
	const TKind extends string,
	const TVersion extends number,
	const TPayload extends DatabaseConstraintPayload,
>(
	kind: TKind,
	version: TVersion,
	payload: TPayload,
): DatabaseConstraintNode<
	TKind,
	TVersion,
	ImmutableDatabaseConstraintPayload<TPayload>
> => {
	assertDatabaseConstraintKind(kind, 'database constraint kind')
	assertDatabaseConstraintVersion(version, 'database constraint version')

	const detachedPayload = snapshotDatabaseConstraintPayload(
		payload,
		'database constraint payload',
	) as ImmutableDatabaseConstraintPayload<TPayload>
	const node = immutableRecord({ kind, version, payload: detachedPayload })
	databaseConstraintNodes.add(node)

	return node
}

/** Rejects structural lookalikes that bypassed the namespaced-node factory. */
export const isDatabaseConstraintNode = (
	value: unknown,
): value is DatabaseConstraintNode =>
	typeof value === 'object' &&
	value !== null &&
	databaseConstraintNodes.has(value)
