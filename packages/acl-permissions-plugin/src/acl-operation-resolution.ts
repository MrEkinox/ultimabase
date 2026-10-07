import {
	RequestSubjectReference,
	applyUpdateExpressionToRecord,
	FrameworkError,
	type ExecutableOperationAst as ExecutableAst,
	type PointerValue,
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
import type { PersistentRoleResolver } from './application-state.js'
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
	type ACLNormalizedUpdateInput,
	type ACLNormalizedUpdateOperation,
	type NormalizedACLSchemaOption,
} from './acl-option.js'

export type ACLCreateOperation = Extract<
	ExecutableAst,
	{ readonly kind: 'create-many' | 'create-one' | 'upsert-many' | 'upsert-one' }
>

interface ACLPreparedUpdateOperation {
	readonly kind: 'update-one'
	readonly query: Readonly<{
		readonly schema: Readonly<{ readonly definition: SchemaDefinition }>
	}>
	readonly update: unknown
}

export const snapshotResolvedACL = (value: unknown, path: string): ACL => {
	if (!(value instanceof ACL)) {
		throw new TypeError(`${path} must resolve to an ACL`)
	}

	return value
}

/** Keeps ACL-document management behind trusted server authority. */
const assertMasterACLManagement = (context: RequestSubjectContext): void => {
	if (context.access.mode === 'master') return

	throw new FrameworkError(
		'PERMISSION_DENIED',
		'Only trusted master execution may supply or replace an ACL value.',
		{
			publicMessage: 'The operation is not permitted.',
			internalDetails: { kind: 'acl-management-requires-master' },
		},
	)
}

/** Projects only developer fields so create and update callbacks share one data shape. */
const projectACLData = (
	schema: SchemaDefinition,
	input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
	return immutableRecord(
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
}

const resolveDefaultACL = async <
	TData extends Readonly<Record<string, unknown>>,
>(
	config: NormalizedACLSchemaOption<TData>,
	data: TData,
	principal: PointerValue | undefined,
	context: RequestSubjectContext,
): Promise<ACL> => {
	const declaredDefault = config.default
	const value =
		typeof declaredDefault === 'function'
			? await declaredDefault({ context, data, principal })
			: declaredDefault

	return snapshotResolvedACL(value, 'acl default')
}

/** Prevents role-bearing values from being accepted without membership resolution. */
const assertACLRoleResolution = (
	value: ACL,
	roleResolutionAvailable: boolean,
): void => {
	if (roleResolutionAvailable || value.toJSON().roles.length === 0) return

	throw new TypeError(
		'ACL role grants require a role resolver with current-role enumeration',
	)
}

/** Replaces every logical role selector with its stable provider-owned identity. */
const resolvePersistentACLRoles = async (
	value: ACL,
	context: RequestSubjectContext,
	resolvePersistentRole: PersistentRoleResolver | undefined,
): Promise<ACL> => {
	const document = value.toJSON()

	if (document.roles.length === 0) return value

	if (resolvePersistentRole === undefined) {
		throw new TypeError(
			'ACL role grants require a role resolver with persistent-role resolution',
		)
	}

	const resolvedEntries = await Promise.all(
		document.roles.map(async (entry) => {
			const resolved = await resolvePersistentRole({
				context,
				role: new RequestSubjectReference('role', entry.value),
			})

			if (!(resolved instanceof RequestSubjectReference)) {
				throw new TypeError(`ACL role could not be resolved: ${entry.value}`)
			}

			return immutableRecord({
				kind: 'role' as const,
				permissions: entry.permissions,
				value: resolved.value,
			})
		}),
	)
	// Canonical parsing already unions aliases that resolve to the same role.
	return ACL.fromJSON({ ...document, roles: resolvedEntries })
}

/** Applies every adapter-neutral invariant to one accepted ACL value. */
const validateAcceptedACL = async (
	value: ACL,
	roleResolutionAvailable: boolean,
	limits: ResolvedACLEntryLimits,
	context: RequestSubjectContext,
	resolvePersistentRole: PersistentRoleResolver | undefined,
): Promise<ACL> => {
	assertACLRoleResolution(value, roleResolutionAvailable)
	const persistent = await resolvePersistentACLRoles(
		value,
		context,
		resolvePersistentRole,
	)
	assertACLEntryLimits(persistent, limits)

	return persistent
}

/** Detects declarations that cannot become valid without role capabilities. */
export const hasStaticRoleGrant = (
	config: NormalizedACLSchemaOption,
): boolean =>
	config.default instanceof ACL && config.default.toJSON().roles.length > 0

const resolveCreateInputACL = async <
	TData extends Readonly<Record<string, unknown>>,
>(
	schema: SchemaDefinition,
	input: Readonly<Record<string, unknown>>,
	config: NormalizedACLSchemaOption<TData>,
	principal: PointerValue | undefined,
	context: RequestSubjectContext,
	roleResolutionAvailable: boolean,
	limits: ResolvedACLEntryLimits,
	resolvePersistentRole: PersistentRoleResolver | undefined,
): Promise<Readonly<Record<string, unknown>>> => {
	// The schema-targeted hook guarantees this extension's declared developer-data shape.
	const data = projectACLData(schema, input) as TData
	const explicitACL = Object.hasOwn(input, aclFieldName)
		? snapshotResolvedACL(input[aclFieldName], 'acl input')
		: undefined

	if (explicitACL !== undefined) assertMasterACLManagement(context)

	if (explicitACL !== undefined && config.resolveInput === undefined) {
		throw new TypeError(
			'Explicit ACL input requires an acl.resolveInput declaration',
		)
	}

	const resolvedInput = await config.resolveInput?.({
		context,
		currentAcl: undefined,
		currentData: undefined,
		data,
		inputAcl: explicitACL,
		operation: 'create',
		principal,
		update: undefined,
	})
	const acceptedACL =
		resolvedInput === undefined
			? await resolveDefaultACL(config, data, principal, context)
			: snapshotResolvedACL(resolvedInput, 'acl resolveInput')
	const resolvedACL = await validateAcceptedACL(
		acceptedACL,
		roleResolutionAvailable,
		limits,
		context,
		resolvePersistentRole,
	)

	return immutableRecord({ ...input, [aclFieldName]: resolvedACL })
}

/** @internal Applies ACL create semantics before Runtime structural revalidation. */
export const resolveCreateOperationACL = async <
	const TOperation extends ACLCreateOperation,
	TData extends Readonly<Record<string, unknown>>,
>(
	operation: TOperation,
	config: NormalizedACLSchemaOption<TData>,
	principal: PointerValue | undefined,
	context: RequestSubjectContext,
	roleResolutionAvailable = false,
	limits: ResolvedACLEntryLimits = defaultACLEntryLimits,
	resolvePersistentRole?: PersistentRoleResolver,
): Promise<TOperation> => {
	switch (operation.kind) {
		case 'create-one':
			return immutableRecord({
				...operation,
				input: await resolveCreateInputACL(
					operation.schema.definition,
					operation.input,
					config,
					principal,
					context,
					roleResolutionAvailable,
					limits,
					resolvePersistentRole,
				),
			})
		case 'create-many':
			return immutableRecord({
				...operation,
				inputs: immutableArray(
					await Promise.all(
						operation.inputs.map((input) =>
							resolveCreateInputACL(
								operation.schema.definition,
								input,
								config,
								principal,
								context,
								roleResolutionAvailable,
								limits,
								resolvePersistentRole,
							),
						),
					),
				),
			})
		case 'upsert-one':
			return immutableRecord({
				...operation,
				create: await resolveCreateInputACL(
					operation.query.schema.definition,
					operation.create,
					config,
					principal,
					context,
					roleResolutionAvailable,
					limits,
					resolvePersistentRole,
				),
			})
		case 'upsert-many':
			return immutableRecord({
				...operation,
				items: immutableArray(
					await Promise.all(
						operation.items.map(async (item) =>
							immutableRecord({
								...item,
								create: await resolveCreateInputACL(
									operation.schema.definition,
									item.create,
									config,
									principal,
									context,
									roleResolutionAvailable,
									limits,
									resolvePersistentRole,
								),
							}),
						),
					),
				),
			})
	}
}

/** Resolves the only supported row-aware ACL replacement after Access approval. */
export const resolvePreparedOperationACL = async <
	const TOperation extends ACLPreparedUpdateOperation,
	TData extends Readonly<Record<string, unknown>>,
>(
	operation: TOperation,
	target: Readonly<Record<string, unknown>>,
	config: NormalizedACLSchemaOption<TData>,
	principal: PointerValue | undefined,
	context: RequestSubjectContext,
	roleResolutionAvailable = false,
	limits: ResolvedACLEntryLimits = defaultACLEntryLimits,
	resolvePersistentRole?: PersistentRoleResolver,
	referenceCleanup?: ACLReferenceSubject,
): Promise<TOperation> => {
	const update: unknown = operation.update

	if (
		!isPlainRecord(update) ||
		update.kind !== 'update-expression' ||
		!isUnknownArray(update.operations)
	) {
		throw new TypeError('ACL update requires a normalized update expression')
	}
	const normalizedUpdate = immutableRecord({
		kind: 'update-expression' as const,
		operations: update.operations,
	})

	const aclOperation = update.operations.find(
		(candidate) => isPlainRecord(candidate) && candidate.field === aclFieldName,
	)

	if (aclOperation === undefined) return operation

	assertMasterACLManagement(context)

	if (referenceCleanup !== undefined) {
		const currentAcl = snapshotResolvedACL(target[aclFieldName], 'current acl')
		const resolvedAcl = removeACLReference(currentAcl, referenceCleanup)
		const operations = immutableArray(
			update.operations.map((candidate) =>
				candidate === aclOperation
					? immutableRecord({ ...aclOperation, value: resolvedAcl })
					: candidate,
			),
		)

		return immutableRecord({
			...operation,
			update: immutableRecord({ ...update, operations }),
		})
	}

	if (
		!isPlainRecord(aclOperation) ||
		aclOperation.kind !== 'set' ||
		!Object.hasOwn(aclOperation, 'value')
	) {
		throw new TypeError('ACL update must replace the complete ACL value')
	}

	if (config.resolveInput === undefined) {
		throw new TypeError(
			'Explicit ACL input requires an acl.resolveInput declaration',
		)
	}

	const currentAcl = snapshotResolvedACL(target[aclFieldName], 'current acl')
	const inputAcl = snapshotResolvedACL(aclOperation.value, 'acl input')
	const schema = operation.query.schema.definition
	const currentData = projectACLData(schema, target) as TData
	// Structural revalidation has normalized every operation before this locked callback.
	const data = projectACLData(
		schema,
		applyUpdateExpressionToRecord(schema, target, normalizedUpdate),
	) as TData
	const updateInput = snapshotACLUpdateInput(normalizedUpdate)
	const resolved = await config.resolveInput({
		context,
		currentAcl,
		currentData,
		data,
		inputAcl,
		operation: 'update',
		principal,
		update: updateInput,
	})
	const acceptedAcl =
		resolved === undefined
			? currentAcl
			: snapshotResolvedACL(resolved, 'acl resolveInput')
	const resolvedAcl = await validateAcceptedACL(
		acceptedAcl,
		roleResolutionAvailable,
		limits,
		context,
		resolvePersistentRole,
	)
	const operations = immutableArray(
		update.operations.map((candidate) =>
			candidate === aclOperation
				? immutableRecord({ ...aclOperation, value: resolvedAcl })
				: candidate,
		),
	)

	return immutableRecord({
		...operation,
		update: immutableRecord({ ...update, operations }),
	})
}

/** Detaches the normalized non-ACL update intent exposed to schema callbacks. */
const snapshotACLUpdateInput = (
	update: Readonly<Record<string, unknown>>,
): ACLNormalizedUpdateInput => {
	if (!isUnknownArray(update.operations)) {
		throw new TypeError('ACL update requires normalized operations')
	}

	const operations: ACLNormalizedUpdateOperation[] = []

	for (const candidate of update.operations) {
		if (
			!isPlainRecord(candidate) ||
			typeof candidate.field !== 'string' ||
			typeof candidate.kind !== 'string'
		) {
			throw new TypeError('ACL update contains an invalid operation')
		}

		if (candidate.field === aclFieldName) continue

		if (
			(candidate.kind !== 'decrement' &&
				candidate.kind !== 'increment' &&
				candidate.kind !== 'set') ||
			!Object.hasOwn(candidate, 'value')
		) {
			throw new TypeError('ACL update contains an unsupported operation')
		}

		operations.push(
			immutableRecord({
				field: candidate.field,
				kind: candidate.kind,
				value: candidate.value,
			}),
		)
	}

	return immutableRecord({
		kind: 'update-expression',
		operations: immutableArray(operations),
	})
}
