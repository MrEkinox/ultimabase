import { isDeepStrictEqual } from 'node:util'

import {
	RequestSubjectReference,
	applyUpdateExpressionToRecord,
	FrameworkError,
	type ExecutableOperationAst as ExecutableAst,
	type Principal,
	type RequestRoleReference,
	type RequestRoleResolver,
	type RequestSubjectContext,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { ACL } from './acl.js'
import { ACLChange, snapshotACLUpdateInput } from './acl-change.js'
import type { ACLPermission } from './acl-contracts.js'
import {
	removeACLReference,
	type ACLReferenceSubject,
} from './acl-reference-cleanup.js'
import {
	assertACLEntryLimits,
	defaultACLEntryLimits,
	type ResolvedACLEntryLimits,
} from './acl-limits.js'
import {
	aclFieldName,
	type ACLClientSharing,
	type ACLNormalizedUpdateOperation,
	type NormalizedACLSchemaOption,
} from './acl-option.js'

export type PersistentRoleResolver = NonNullable<
	RequestRoleResolver['resolvePersistentRole']
>

export type ACLCreateOperation = Extract<
	ExecutableAst,
	{ readonly kind: 'create-many' | 'create-one' | 'upsert-many' | 'upsert-one' }
>

export interface ACLPreparedUpdateOperation {
	readonly kind: 'update-one'
	readonly query: Readonly<{
		readonly schema: Readonly<{ readonly definition: SchemaDefinition }>
	}>
	readonly update: unknown
}

/** Carries the request facts needed to validate one accepted ACL value. */
interface ACLAcceptance {
	readonly context: RequestSubjectContext
	readonly limits: ResolvedACLEntryLimits
	readonly resolvePersistentRole: PersistentRoleResolver | undefined
	readonly roleResolutionAvailable: boolean
}

/** Groups the request facts shared by every ACL value resolved in one operation. */
interface ACLResolution<
	TData extends Readonly<Record<string, unknown>>,
> extends ACLAcceptance {
	readonly config: NormalizedACLSchemaOption<TData>
	readonly principal: Principal | undefined
}

export const snapshotResolvedACL = (value: unknown, path: string): ACL => {
	if (!(value instanceof ACL)) {
		throw new TypeError(`${path} must resolve to an ACL`)
	}

	return value
}

/** Detects declarations that cannot become valid without role capabilities. */
export const hasStaticRoleGrant = (
	config: NormalizedACLSchemaOption,
): boolean =>
	config.default instanceof ACL && config.default.toJSON().roles.length > 0

const deniedACLManagement = (message: string, kind: string): FrameworkError =>
	new FrameworkError('PERMISSION_DENIED', message, {
		publicMessage: 'The operation is not permitted.',
		internalDetails: { kind },
	})

/** Keeps ACL-document management behind trusted server authority. */
const assertMasterACLManagement = (context: RequestSubjectContext): void => {
	if (context.access.mode === 'master') return

	throw deniedACLManagement(
		'Only trusted master execution may supply or replace an ACL value; clients share with { grant } or { revoke } when acl.clientSharing allows it.',
		'acl-management-requires-master',
	)
}

/** ACL values this plugin accepted, so the field policy lets them through. */
const acceptedACLValues = new WeakSet<ACL>()

/** Reports whether this plugin produced one ACL operation value. */
export const isAcceptedACLValue = (value: unknown): boolean =>
	value instanceof ACL && acceptedACLValues.has(value)

/** Reports whether the caller holds `permission` on `acl` itself. */
const holdsACLPermission = (
	acl: ACL,
	principal: Principal | undefined,
	roles: readonly RequestRoleReference[],
	permission: ACLPermission,
): boolean =>
	acl.hasPublicPermission(permission) ||
	(principal !== undefined &&
		(acl.hasAuthenticatedPermission(permission) ||
			acl.hasPrincipalPermission(principal, permission))) ||
	roles.some((role) => acl.hasRolePermission(role, permission))

/**
 * Applies one `grant` or `revoke` to the locked ACL: Master always may; a
 * client only when `clientSharing` allows this row, and never grants rights
 * it does not hold itself (ADR-0321).
 */
const applyACLChange = async (
	change: ACLChange,
	currentAcl: ACL,
	clientSharing: ACLClientSharing | undefined,
	context: RequestSubjectContext,
	principal: Principal | undefined,
	roles: readonly RequestRoleReference[],
): Promise<ACL> => {
	if (context.access.mode !== 'master') {
		if (
			clientSharing === undefined ||
			!(await clientSharing({ currentAcl, principal }))
		) {
			throw deniedACLManagement(
				'acl.clientSharing does not allow this caller to share the row.',
				'acl-sharing-denied',
			)
		}
		const escalated = (change.kind === 'grant' ? change.permissions : [])?.find(
			(permission) =>
				!holdsACLPermission(currentAcl, principal, roles, permission),
		)
		if (escalated !== undefined) {
			throw deniedACLManagement(
				`A client cannot grant the ${escalated} right it does not hold itself.`,
				'acl-sharing-escalation',
			)
		}
	}
	return change.applyTo(currentAcl)
}

/** Projects only developer fields so create and update callbacks share one data shape. */
const projectACLData = (
	schema: SchemaDefinition,
	input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
	immutableRecord(
		Object.fromEntries(
			Object.entries(input).filter(([fieldName]) => {
				const field = schema.persistedFields[fieldName]

				return (
					field !== undefined &&
					schema.provenance.fields[fieldName]?.owner.kind === 'application' &&
					!('system' in field.options && field.options.system === true)
				)
			}),
		),
	)

/**
 * Applies every adapter-neutral invariant to one accepted ACL value: role
 * grants need membership resolution, logical roles become stable provider
 * identities, and the canonical result must respect the entry limits.
 */
const acceptACL = async (
	candidate: unknown,
	path: string,
	{
		context,
		limits,
		resolvePersistentRole,
		roleResolutionAvailable,
	}: ACLAcceptance,
): Promise<ACL> => {
	const value = snapshotResolvedACL(candidate, path)
	const document = value.toJSON()
	let accepted = value

	if (document.roles.length > 0) {
		if (!roleResolutionAvailable) {
			throw new TypeError(
				'ACL role grants require a role resolver with current-role enumeration',
			)
		}
		if (resolvePersistentRole === undefined) {
			throw new TypeError(
				'ACL role grants require a role resolver with persistent-role resolution',
			)
		}
		const roles = await Promise.all(
			document.roles.map(async ({ permissions, value: role }) => {
				const resolved = await resolvePersistentRole({
					context,
					role: new RequestSubjectReference('role', role),
				})
				if (!(resolved instanceof RequestSubjectReference)) {
					throw new TypeError(`ACL role could not be resolved: ${role}`)
				}
				return { kind: 'role' as const, permissions, value: resolved.value }
			}),
		)
		// Canonical parsing already unions aliases that resolve to the same role.
		accepted = ACL.fromJSON({ ...document, roles })
	}

	assertACLEntryLimits(accepted, limits)
	// A fresh copy: a caller's own instance never becomes trusted.
	const trusted = ACL.fromJSON(accepted.toJSON())
	acceptedACLValues.add(trusted)
	return trusted
}

const resolveCreateInputACL = async <
	TData extends Readonly<Record<string, unknown>>,
>(
	schema: SchemaDefinition,
	input: Readonly<Record<string, unknown>>,
	resolution: ACLResolution<TData>,
): Promise<Readonly<Record<string, unknown>>> => {
	const { config, context, principal } = resolution
	// The schema-targeted hook guarantees this extension's declared developer-data shape.
	const data = projectACLData(schema, input) as TData
	let acl: ACL
	if (Object.hasOwn(input, aclFieldName)) {
		// Master writes an explicit ACL as is; `resolveInput` is not called.
		assertMasterACLManagement(context)
		acl = await acceptACL(
			snapshotResolvedACL(input[aclFieldName], 'acl input'),
			'acl input',
			resolution,
		)
	} else {
		const resolved = await config.resolveInput?.({
			context,
			currentAcl: undefined,
			currentData: undefined,
			data,
			operation: 'create',
			principal,
			update: undefined,
		})
		acl =
			resolved !== undefined
				? await acceptACL(resolved, 'acl resolveInput', resolution)
				: await acceptACL(
						typeof config.default === 'function'
							? await config.default({ context, data, principal })
							: config.default,
						'acl default',
						resolution,
					)
	}

	return immutableRecord({ ...input, [aclFieldName]: acl })
}

/** @internal Applies ACL create semantics before Runtime structural revalidation. */
export const resolveCreateOperationACL = async <
	const TOperation extends ACLCreateOperation,
	TData extends Readonly<Record<string, unknown>>,
>(
	operation: TOperation,
	config: NormalizedACLSchemaOption<TData>,
	principal: Principal | undefined,
	context: RequestSubjectContext,
	roleResolutionAvailable = false,
	limits: ResolvedACLEntryLimits = defaultACLEntryLimits,
	resolvePersistentRole?: PersistentRoleResolver,
): Promise<TOperation> => {
	const resolution = {
		config,
		context,
		limits,
		principal,
		resolvePersistentRole,
		roleResolutionAvailable,
	}
	const schema =
		operation.kind === 'upsert-one'
			? operation.query.schema.definition
			: operation.schema.definition
	const resolve = (
		input: Readonly<Record<string, unknown>>,
	): Promise<Readonly<Record<string, unknown>>> =>
		resolveCreateInputACL(schema, input, resolution)

	switch (operation.kind) {
		case 'create-one':
			return immutableRecord({
				...operation,
				input: await resolve(operation.input),
			})
		case 'create-many':
			return immutableRecord({
				...operation,
				inputs: immutableArray(
					await Promise.all(operation.inputs.map((input) => resolve(input))),
				),
			})
		case 'upsert-one':
			return immutableRecord({
				...operation,
				create: await resolve(operation.create),
			})
		case 'upsert-many':
			return immutableRecord({
				...operation,
				items: immutableArray(
					await Promise.all(
						operation.items.map(async (item) =>
							immutableRecord({ ...item, create: await resolve(item.create) }),
						),
					),
				),
			})
	}
}

/** Detaches the normalized non-ACL update operations exposed to schema callbacks. */
const snapshotUpdateOperations = (
	operations: readonly unknown[],
): readonly ACLNormalizedUpdateOperation[] =>
	immutableArray(
		operations.flatMap((candidate) => {
			if (
				!isPlainRecord(candidate) ||
				typeof candidate.field !== 'string' ||
				typeof candidate.kind !== 'string'
			) {
				throw new TypeError('ACL update contains an invalid operation')
			}
			if (candidate.field === aclFieldName) return []
			if (
				(candidate.kind !== 'decrement' &&
					candidate.kind !== 'increment' &&
					candidate.kind !== 'set') ||
				!Object.hasOwn(candidate, 'value')
			) {
				throw new TypeError('ACL update contains an unsupported operation')
			}
			const { field, kind, value } = candidate
			return [immutableRecord({ field, kind, value })]
		}),
	)

/** Projects the normalized update callbacks see, without the ACL operation. */
const readResolutionUpdate = (
	schema: SchemaDefinition,
	target: Readonly<Record<string, unknown>>,
	operations: readonly unknown[],
) => ({
	currentData: projectACLData(schema, target),
	data: projectACLData(
		schema,
		applyUpdateExpressionToRecord(
			schema,
			target,
			immutableRecord({ kind: 'update-expression' as const, operations }),
		),
	),
	update: immutableRecord({
		kind: 'update-expression' as const,
		operations: snapshotUpdateOperations(operations),
	}),
})

const readUpdateExpression = (
	operation: ACLPreparedUpdateOperation,
): Readonly<{
	operations: readonly unknown[]
	record: Readonly<Record<string, unknown>>
}> => {
	const update: unknown = operation.update
	if (
		!isPlainRecord(update) ||
		update.kind !== 'update-expression' ||
		!isUnknownArray(update.operations)
	) {
		throw new TypeError('ACL update requires a normalized update expression')
	}
	return { operations: update.operations, record: update }
}

const findACLOperation = (
	operations: readonly unknown[],
): Readonly<Record<string, unknown>> | undefined => {
	const found = operations.find(
		(candidate) => isPlainRecord(candidate) && candidate.field === aclFieldName,
	)
	return isPlainRecord(found) ? found : undefined
}

/** Replaces the ACL operation of an update, or appends one. */
const withACLOperation = <const TOperation extends ACLPreparedUpdateOperation>(
	operation: TOperation,
	acl: ACL,
): TOperation => {
	const update = readUpdateExpression(operation)
	const current = findACLOperation(update.operations)
	const replacement = immutableRecord({
		field: aclFieldName,
		kind: 'set' as const,
		value: acl,
	})
	return immutableRecord({
		...operation,
		update: immutableRecord({
			...update.record,
			operations: immutableArray(
				current === undefined
					? [...update.operations, replacement]
					: update.operations.map((candidate) =>
							candidate === current ? replacement : candidate,
						),
			),
		}),
	})
}

/**
 * Resolves an explicit ACL, a `grant`/`revoke` or a subject cleanup of one
 * singular update against its locked row, after Access approval.
 */
export const resolvePreparedOperationACL = async <
	const TOperation extends ACLPreparedUpdateOperation,
	TData extends Readonly<Record<string, unknown>>,
>(
	operation: TOperation,
	target: Readonly<Record<string, unknown>>,
	config: NormalizedACLSchemaOption<TData>,
	principal: Principal | undefined,
	context: RequestSubjectContext,
	roleResolutionAvailable = false,
	limits: ResolvedACLEntryLimits = defaultACLEntryLimits,
	resolvePersistentRole?: PersistentRoleResolver,
	referenceCleanup?: ACLReferenceSubject,
	roles: readonly RequestRoleReference[] = [],
): Promise<TOperation> => {
	const aclOperation = findACLOperation(
		readUpdateExpression(operation).operations,
	)
	// Values this plugin produced (`resolveInput`) are already accepted.
	if (aclOperation === undefined || isAcceptedACLValue(aclOperation.value)) {
		return operation
	}
	const acceptance = {
		context,
		limits,
		resolvePersistentRole,
		roleResolutionAvailable,
	}
	const currentAcl = snapshotResolvedACL(target[aclFieldName], 'current acl')

	if (referenceCleanup !== undefined) {
		assertMasterACLManagement(context)
		// Subject cleanup removes one exact entry from the locked current value.
		return withACLOperation(
			operation,
			removeACLReference(currentAcl, referenceCleanup),
		)
	}
	if (aclOperation.kind !== 'set' || !Object.hasOwn(aclOperation, 'value')) {
		throw new TypeError('ACL update must set an ACL, a grant or a revoke')
	}
	const value = snapshotACLUpdateInput(aclOperation.value, 'acl')
	if (value instanceof ACLChange) {
		return withACLOperation(
			operation,
			await acceptACL(
				await applyACLChange(
					value,
					currentAcl,
					config.clientSharing,
					context,
					principal,
					roles,
				),
				'acl change',
				acceptance,
			),
		)
	}
	// Master writes an explicit ACL as is; `resolveInput` is not called.
	assertMasterACLManagement(context)
	return withACLOperation(
		operation,
		await acceptACL(value, 'acl input', acceptance),
	)
}

/**
 * Recomputes the ACL of one singular update that carries none through
 * `resolveInput`, from the locked row and the proposed data (ADR-0321).
 */
export const recomputeUpdateOperationACL = async <
	const TOperation extends ACLPreparedUpdateOperation,
	TData extends Readonly<Record<string, unknown>>,
>(
	operation: TOperation,
	target: Readonly<Record<string, unknown>>,
	config: NormalizedACLSchemaOption<TData>,
	principal: Principal | undefined,
	context: RequestSubjectContext,
	roleResolutionAvailable = false,
	limits: ResolvedACLEntryLimits = defaultACLEntryLimits,
	resolvePersistentRole?: PersistentRoleResolver,
): Promise<TOperation> => {
	const update = readUpdateExpression(operation)
	if (
		config.resolveInput === undefined ||
		findACLOperation(update.operations) !== undefined
	) {
		return operation
	}
	const currentAcl = snapshotResolvedACL(target[aclFieldName], 'current acl')
	const { currentData, data, update: normalizedUpdate } = readResolutionUpdate(
		operation.query.schema.definition,
		target,
		update.operations,
	)
	// Structural revalidation has normalized every operation before this locked callback.
	const resolved: unknown = await config.resolveInput({
		context,
		currentAcl,
		currentData: currentData as TData,
		data: data as TData,
		operation: 'update',
		principal,
		update: normalizedUpdate,
	})
	if (
		resolved === undefined ||
		(resolved instanceof ACL &&
			isDeepStrictEqual(resolved.toJSON(), currentAcl.toJSON()))
	) {
		return operation
	}
	return withACLOperation(
		operation,
		await acceptACL(resolved, 'acl resolveInput', {
			context,
			limits,
			resolvePersistentRole,
			roleResolutionAvailable,
		}),
	)
}
