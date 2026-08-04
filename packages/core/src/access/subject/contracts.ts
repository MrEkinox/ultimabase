import {
	assertNonEmptyString,
	immutableRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'

import type { RequestContextValue } from '../request/context-value.js'
import type { AccessContext } from '../request/context.js'
import { createServiceToken } from '../../services/service-token.js'
import type { ServiceToken } from '../../services/service-token.js'
import { Pointer, type PointerValue } from '../../schema/relations/pointer.js'
import type { SchemaDefinition } from '../../schema/schema/definition.js'

/** Gives a plugin-owned context token an explicit Access-domain meaning. */
export type AccessSubjectValue<
	TSubject,
	TName extends string = string,
> = RequestContextValue<TSubject, TName>

/** Extracts the exact subject value carried by a nominal context token. */
export type InferAccessSubjectValue<
	TToken extends AccessSubjectValue<unknown>,
> = TToken extends AccessSubjectValue<infer TSubject> ? TSubject : never

/** Supplies the immutable request surface to one optional principal provider. */
export interface AccessPrincipalResolutionInput {
	readonly context: AccessContext
}

/**
 * Resolves the current request principal as one exact Core Pointer.
 *
 * Authentication, credentials, and session behavior remain provider-owned.
 * Returning `undefined` is the fail-closed anonymous result.
 */
export interface AccessPrincipalResolver<
	TPrincipal extends PointerValue = PointerValue,
> {
	resolveCurrent(
		input: AccessPrincipalResolutionInput,
	): MaybePromise<TPrincipal | undefined>
}

/** Configures framework validation around one optional principal provider. */
export interface ResolveAccessPrincipalOptions {
	readonly context: AccessContext
	readonly resolver: AccessPrincipalResolver | undefined
	/** Confirms exact schema ownership inside the consuming application. */
	readonly ownsSchema: (schema: SchemaDefinition) => boolean
}

/**
 * Resolves and validates one optional application-local principal.
 *
 * @example
 * ```ts
 * const principal = await resolveAccessPrincipal({
 *   context,
 *   resolver: services.getOptional(accessPrincipalResolverServiceToken),
 *   ownsSchema: (schema) => schemas.get(schema.className) === schema,
 * })
 * ```
 */
export const resolveAccessPrincipal = async (
	options: ResolveAccessPrincipalOptions,
): Promise<PointerValue | undefined> => {
	const principal = await options.resolver?.resolveCurrent({
		context: options.context,
	})

	if (principal === undefined) {
		return undefined
	}

	if (!Pointer.is(principal)) {
		throw new TypeError('Access principal resolver must return a Core Pointer')
	}

	if (!options.ownsSchema(principal.schema)) {
		throw new TypeError(
			'Access principal resolver returned a foreign application schema',
		)
	}

	return principal
}

/** Identifies the optional principal provider without naming authentication. */
export const accessPrincipalResolverServiceToken: ServiceToken<AccessPrincipalResolver> =
	createServiceToken<AccessPrincipalResolver>(
		'ultimabase.access.principal-resolver',
	)

/**
 * Identifies one policy-domain subject without naming its provider plugin.
 *
 * The kind belongs to the permission provider while the value may be a stable
 * key, an object identifier, or another immutable application reference.
 *
 * @example `new AccessSubjectReference('role', 'editor')`
 */
export class AccessSubjectReference<
	const TKind extends string,
	const TValue extends string | number,
> {
	// The private member prevents community integrations from forging plain objects.
	declare private readonly accessSubjectReferenceIdentity: readonly [
		TKind,
		TValue,
	]

	readonly kind: TKind
	readonly value: TValue

	constructor(kind: TKind, value: TValue) {
		if (typeof kind !== 'string' || kind.length === 0) {
			throw new TypeError('Access subject kind must be a non-empty string')
		}

		this.kind = kind
		this.value = value

		// Reference identity and payload cannot be replaced after configuration.
		Object.freeze(this)
	}
}

/** Describes the neutral reference shape used when a principal object is deleted. */
export type AccessPrincipalReference = AccessSubjectReference<
	'principal',
	string
>

/** Retains the exact schema-qualified identity encoded by a principal reference. */
export interface AccessPrincipalReferenceIdentity {
	readonly className: string
	readonly id: string
}

const principalReferenceNamespace = '@ultimabase/core' as const
const principalReferenceVersion = 1 as const
const parseJSON: (value: string) => unknown = JSON.parse

/**
 * Creates one stable provider-neutral reference for a persisted principal.
 *
 * Subject-owning plugins pass this value to generic reference-cleanup
 * contributions without importing any ACL implementation.
 *
 * @example `createAccessPrincipalReference(User.pointer(userId))`
 */
export const createAccessPrincipalReference = (
	principal: PointerValue,
): AccessPrincipalReference => {
	if (!Pointer.is(principal)) {
		throw new TypeError('Access principal reference requires a Core Pointer')
	}

	return new AccessSubjectReference(
		'principal',
		JSON.stringify([
			principalReferenceNamespace,
			principalReferenceVersion,
			principal.schema.className,
			principal.id,
		]),
	)
}

/**
 * Parses one exact principal identity without resolving its schema or provider.
 *
 * @example `parseAccessPrincipalReference(reference) // { className, id }`
 */
export const parseAccessPrincipalReference = (
	reference: AccessPrincipalReference,
): Readonly<AccessPrincipalReferenceIdentity> => {
	const candidate: unknown = reference

	if (
		!(candidate instanceof AccessSubjectReference) ||
		candidate.kind !== 'principal' ||
		typeof candidate.value !== 'string'
	) {
		throw new TypeError('Access principal reference is invalid')
	}

	let value: unknown

	try {
		value = parseJSON(candidate.value)
	} catch {
		throw new TypeError('Access principal reference value is invalid')
	}

	if (
		!isUnknownArray(value) ||
		value.length !== 4 ||
		value[0] !== principalReferenceNamespace ||
		value[1] !== principalReferenceVersion
	) {
		throw new TypeError('Access principal reference value is invalid')
	}

	assertNonEmptyString(value[2], 'Access principal reference className')
	assertNonEmptyString(value[3], 'Access principal reference id')

	return immutableRecord({ className: value[2], id: value[3] })
}

/** Describes the neutral reference shape consumed by role-aware policies. */
export type AccessRoleReference<TValue extends string | number = string> =
	AccessSubjectReference<'role', TValue>

/** Lets a persisted provider-owned value expose its neutral role reference. */
export interface AccessRoleReferenceCarrier {
	/** Returns one stable role reference without performing persistence or lookup. */
	readonly toAccessRoleReference: () => AccessRoleReference
}

/** Accepts either a lightweight reference or a persisted role value. */
export type AccessRoleSubject = AccessRoleReference | AccessRoleReferenceCarrier

const isAccessRoleReferenceCarrier = (
	value: unknown,
): value is AccessRoleReferenceCarrier =>
	typeof value === 'object' &&
	value !== null &&
	'toAccessRoleReference' in value &&
	typeof value.toAccessRoleReference === 'function'

const isAccessRoleReference = (value: unknown): value is AccessRoleReference =>
	value instanceof AccessSubjectReference &&
	value.kind === 'role' &&
	typeof value.value === 'string'

/**
 * Normalizes one role subject without identifying its provider package.
 *
 * The returned reference remains the only value consumed by Access providers.
 */
export const resolveAccessRoleReference = (
	subject: AccessRoleSubject,
): AccessRoleReference => {
	const candidate: unknown = subject
	const reference: unknown =
		candidate instanceof AccessSubjectReference
			? candidate
			: isAccessRoleReferenceCarrier(candidate)
				? candidate.toAccessRoleReference()
				: undefined

	if (!isAccessRoleReference(reference)) {
		throw new TypeError(
			'Access role subject must provide one string role reference',
		)
	}

	return reference
}

/** Supplies one request-local subject lookup to a provider-owned resolver. */
export interface AccessSubjectResolutionInput<TReference> {
	readonly context: AccessContext
	readonly reference: TReference
}

/**
 * Resolves a neutral policy reference without exposing auth or role plugins.
 *
 * `undefined` is the fail-closed result for unavailable dynamic identity data.
 */
export interface AccessSubjectResolver<TReference, TSubject> {
	resolve(
		input: AccessSubjectResolutionInput<TReference>,
	): MaybePromise<TSubject | undefined>
}

/** Supplies one role membership lookup without exposing a role plugin identity. */
export interface AccessRoleResolutionInput {
	readonly context: AccessContext
	readonly role: AccessRoleReference
}

/** Allows official or community providers to resolve request-local role membership. */
export interface AccessRoleResolver {
	hasRole(input: AccessRoleResolutionInput): MaybePromise<boolean>
	/**
	 * Converts a logical role selector into its stable schema-qualified storage identity.
	 *
	 * Persisted policy providers require this optional capability only when their
	 * value contains role references. `undefined` rejects an unknown role.
	 */
	resolvePersistentRole?(
		input: AccessRoleResolutionInput,
	): MaybePromise<AccessRoleReference | undefined>
	/**
	 * Lists stable role references held by the current request principal.
	 *
	 * Row-level providers use this optional capability when candidate role
	 * references live inside persisted rows and are therefore unknown before SQL.
	 */
	resolveCurrentRoles?(
		input: AccessPrincipalResolutionInput,
	): MaybePromise<readonly AccessRoleReference[] | undefined>
}

/**
 * Identifies the optional neutral role resolver shared by permission providers.
 *
 * A CLP or ACL plugin requires this token only when its configured policy
 * contains a role subject.
 */
export const accessRoleResolverServiceToken: ServiceToken<AccessRoleResolver> =
	createServiceToken<AccessRoleResolver>('ultimabase.access.role-resolver')

/** Extracts the exact resolved value supplied by one neutral resolver. */
export type InferResolvedAccessSubject<TResolver> =
	TResolver extends AccessSubjectResolver<unknown, infer TSubject>
		? TSubject
		: never
