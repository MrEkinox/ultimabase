import { isDeepStrictEqual } from 'node:util'

import {
	applyUpdateExpressionToRecord,
	type Principal,
	type RequestRoleReference,
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
import {
	acceptACL,
	applyACLChange,
	assertMasterACLManagement,
	isAcceptedACLValue,
	projectACLData,
	snapshotResolvedACL,
	type PersistentRoleResolver,
} from './acl-acceptance.js'
import { ACLChange, snapshotACLUpdateInput } from './acl-change.js'
import {
	defaultACLEntryLimits,
	type ResolvedACLEntryLimits,
} from './acl-limits.js'
import {
	aclFieldName,
	type ACLNormalizedUpdateOperation,
	type NormalizedACLSchemaOption,
} from './acl-option.js'
import {
	removeACLReference,
	type ACLReferenceSubject,
} from './acl-reference-cleanup.js'

export interface ACLPreparedUpdateOperation {
	readonly kind: 'update-one'
	readonly query: Readonly<{
		readonly schema: Readonly<{ readonly definition: SchemaDefinition }>
	}>
	readonly update: unknown
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
	const {
		currentData,
		data,
		update: normalizedUpdate,
	} = readResolutionUpdate(
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
