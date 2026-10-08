import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'
import { assertExactEnumerablePlainObject } from '../../exact-object-validation.js'

import { assertDatabaseConstraintVersion } from '../../plugins/constraint-compilers.js'
import { assertConstraintKind } from '../../schema/schema/constraints.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import type {
	EnforcementContributionKind,
	EnforcementGuardHandler,
	EnforcementOperationInput,
} from './contracts.js'
import type { DatabaseConstraintNode } from '../database/contracts.js'
import type {
	DatabaseConstraintPayload,
	ImmutableDatabaseConstraintPayload,
} from '../database/contracts.js'
import type { RuntimeLogicalOperationKind } from '../pipeline/contracts.js'
import { normalizeRuntimeOperationKinds } from '../operations/characteristics.js'

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

type ErasedEnforcementHandler = (
	input: EnforcementOperationInput<never>,
) => MaybePromise<unknown>

/** Supplies Runtime with the handler paired to a validated public definition. */
export interface EnforcementContributionImplementation {
	readonly kind: EnforcementContributionKind
	readonly master: 'bypass' | 'enforce'
	readonly schema: SchemaDefinition | undefined
	readonly operations: readonly RuntimeLogicalOperationKind[] | undefined
	run(input: EnforcementOperationInput<never>): MaybePromise<unknown>
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
	// Only enumerable string keys are option names; symbol keys are ignored.
	assertExactEnumerablePlainObject(
		untrustedOptions,
		optionKeys,
		'enforcement contribution options must be a plain object',
		'enforcement contribution contains unknown key: ',
	)
	if (typeof untrustedOptions.handler !== 'function') {
		throw new TypeError('enforcement contribution handler must be a function')
	}
	assertMasterMode(untrustedOptions.master, 'enforcement contribution')
	if (options.schema !== undefined && !Schema.is(options.schema)) {
		throw new TypeError(
			'enforcement contribution schema must be a schema definition',
		)
	}

	const operations = normalizeRuntimeOperationKinds(
		options.operations,
		'enforcement',
	)
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

/** Resolves only definitions created by the policy-neutral public factories. */
export const getEnforcementContributionImplementation = (
	value: unknown,
): EnforcementContributionImplementation | undefined =>
	typeof value === 'object' && value !== null
		? implementations.get(value)
		: undefined

/** Validates the optional per-definition master bypass declaration. */
export const assertMasterMode = (master: unknown, subject: string): void => {
	if (master !== undefined && master !== 'bypass' && master !== 'enforce') {
		throw new TypeError(`${subject} master must be bypass or enforce`)
	}
}

/** Matches inert schema and operation metadata without invoking one definition. */
export const matchesEnforcementContribution = (
	implementation: Readonly<{
		operations: readonly RuntimeLogicalOperationKind[] | undefined
		schema: SchemaDefinition | undefined
	}>,
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
	assertConstraintKind(kind, 'database constraint kind')
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
