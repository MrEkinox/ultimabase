import {
	assertNonEmptyString,
	immutableRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'

import type { RequestContextValue } from '../request/context-value.js'
import type { RequestSubjectContext } from '../request/context.js'
import {
	defineCapability,
	type CapabilityToken,
} from '../../plugins/capabilities.js'
import { Pointer, type PointerValue } from '../../schema/relations/pointer.js'
import type { SchemaDefinition } from '../../schema/schema/definition.js'

/** Gives a plugin-owned context token an explicit Access-domain meaning. */
export type RequestSubjectValue<
	TSubject,
	TName extends string = string,
> = RequestContextValue<TSubject, TName>

/** Extracts the exact subject value carried by a nominal context token. */
export type RequestSubjectValueOf<TToken extends RequestSubjectValue<unknown>> =
	TToken extends RequestSubjectValue<infer TSubject> ? TSubject : never

/** Supplies the immutable request surface to one optional principal provider. */
export interface RequestPrincipalResolutionInput {
	readonly context: RequestSubjectContext
}

/**
 * Resolves the current request principal as one exact Core Pointer.
 *
 * Authentication, credentials, and session behavior remain provider-owned.
 * Returning `undefined` is the fail-closed anonymous result.
 */
export interface RequestPrincipalResolver<
	TPrincipal extends PointerValue = PointerValue,
> {
	resolveCurrent(
		input: RequestPrincipalResolutionInput,
	): MaybePromise<TPrincipal | undefined>
}

/** Configures framework validation around one optional principal provider. */
export interface ResolveRequestPrincipalOptions {
	readonly context: RequestSubjectContext
	readonly resolver: RequestPrincipalResolver | undefined
	/** Confirms exact schema ownership inside the consuming application. */
	readonly ownsSchema: (schema: SchemaDefinition) => boolean
}

/**
 * Resolves and validates one optional application-local principal.
 *
 * @example
 * ```ts
 * const principal = await resolveRequestPrincipal({
 *   context,
 *   resolver: capabilities.get(optionalPrincipalResolver),
 *   ownsSchema: (schema) => schemas.get(schema.className) === schema,
 * })
 * ```
 */
export const resolveRequestPrincipal = async (
	options: ResolveRequestPrincipalOptions,
): Promise<PointerValue | undefined> => {
	const principal = await options.resolver?.resolveCurrent({
		context: options.context,
	})

	if (principal === undefined) {
		return undefined
	}

	if (!Pointer.is(principal)) {
		throw new TypeError('Request principal resolver must return a Core Pointer')
	}

	if (!options.ownsSchema(principal.schema)) {
		throw new TypeError(
			'Request principal resolver returned a foreign application schema',
		)
	}

	return principal
}

/** Identifies the optional principal provider without naming authentication. */
export const requestPrincipalResolverCapability: CapabilityToken<
	RequestPrincipalResolver,
	RequestPrincipalResolver,
	'ultimabase.request-subject.principal-resolver',
	'1.0.0',
	'single',
	'application'
> = defineCapability<RequestPrincipalResolver>()({
	capabilityId: 'ultimabase.request-subject.principal-resolver',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([provider]) => provider,
})

/**
 * Identifies one policy-domain subject without naming its provider plugin.
 *
 * The kind belongs to the permission provider while the value may be a stable
 * key, an object identifier, or another immutable application reference.
 *
 * @example `new RequestSubjectReference('role', 'editor')`
 */
export class RequestSubjectReference<
	const TKind extends string,
	const TValue extends string | number,
> {
	// The private member prevents community integrations from forging plain objects.
	declare private readonly requestSubjectReferenceIdentity: readonly [
		TKind,
		TValue,
	]

	readonly kind: TKind
	readonly value: TValue

	constructor(kind: TKind, value: TValue) {
		assertNonEmptyString(kind, 'Request subject kind')

		this.kind = kind
		this.value = value

		// Reference identity and payload cannot be replaced after configuration.
		Object.freeze(this)
	}
}

/** Describes the neutral reference shape used when a principal object is deleted. */
export type RequestPrincipalReference = RequestSubjectReference<
	'principal',
	string
>

/** Retains the exact schema-qualified identity encoded by a principal reference. */
export interface RequestPrincipalReferenceIdentity {
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
 * contributions without importing a persisted-policy implementation.
 *
 * @example `createRequestPrincipalReference(User.pointer(userId))`
 */
export const createRequestPrincipalReference = (
	principal: PointerValue,
): RequestPrincipalReference => {
	if (!Pointer.is(principal)) {
		throw new TypeError('Request principal reference requires a Core Pointer')
	}

	return new RequestSubjectReference(
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
 * @example `parseRequestPrincipalReference(reference) // { className, id }`
 */
export const parseRequestPrincipalReference = (
	reference: RequestPrincipalReference,
): Readonly<RequestPrincipalReferenceIdentity> => {
	const candidate: unknown = reference

	if (
		!(candidate instanceof RequestSubjectReference) ||
		candidate.kind !== 'principal' ||
		typeof candidate.value !== 'string'
	) {
		throw new TypeError('Request principal reference is invalid')
	}

	let value: unknown

	try {
		value = parseJSON(candidate.value)
	} catch {
		throw new TypeError('Request principal reference value is invalid')
	}

	if (
		!isUnknownArray(value) ||
		value.length !== 4 ||
		value[0] !== principalReferenceNamespace ||
		value[1] !== principalReferenceVersion
	) {
		throw new TypeError('Request principal reference value is invalid')
	}

	assertNonEmptyString(value[2], 'Request principal reference className')
	assertNonEmptyString(value[3], 'Request principal reference id')

	return immutableRecord({ className: value[2], id: value[3] })
}

/** Describes the neutral reference shape consumed by role-aware policies. */
export type RequestRoleReference<TValue extends string | number = string> =
	RequestSubjectReference<'role', TValue>

/** Lets a persisted provider-owned value expose its neutral role reference. */
export interface RequestRoleReferenceCarrier {
	/** Returns one stable role reference without performing persistence or lookup. */
	readonly toRequestRoleReference: () => RequestRoleReference
}

/** Accepts either a lightweight reference or a persisted role value. */
export type RequestRoleSubject =
	RequestRoleReference | RequestRoleReferenceCarrier

const isRequestRoleReferenceCarrier = (
	value: unknown,
): value is RequestRoleReferenceCarrier =>
	typeof value === 'object' &&
	value !== null &&
	'toRequestRoleReference' in value &&
	typeof value.toRequestRoleReference === 'function'

const isRequestRoleReference = (
	value: unknown,
): value is RequestRoleReference =>
	value instanceof RequestSubjectReference &&
	value.kind === 'role' &&
	typeof value.value === 'string'

/**
 * Normalizes one role subject without identifying its provider package.
 *
 * The returned reference remains the only value consumed by Access providers.
 */
export const resolveRequestRoleReference = (
	subject: RequestRoleSubject,
): RequestRoleReference => {
	const candidate: unknown = subject
	const reference: unknown =
		candidate instanceof RequestSubjectReference
			? candidate
			: isRequestRoleReferenceCarrier(candidate)
				? candidate.toRequestRoleReference()
				: undefined

	if (!isRequestRoleReference(reference)) {
		throw new TypeError(
			'Request role subject must provide one string role reference',
		)
	}

	return reference
}

/** Supplies one request-local subject lookup to a provider-owned resolver. */
export interface RequestSubjectResolutionInput<TReference> {
	readonly context: RequestSubjectContext
	readonly reference: TReference
}

/**
 * Resolves a neutral policy reference without exposing auth or role plugins.
 *
 * `undefined` is the fail-closed result for unavailable dynamic identity data.
 */
export interface RequestSubjectResolver<TReference, TSubject> {
	resolve(
		input: RequestSubjectResolutionInput<TReference>,
	): MaybePromise<TSubject | undefined>
}

/** Supplies one role membership lookup without exposing a role plugin identity. */
export interface RequestRoleResolutionInput {
	readonly context: RequestSubjectContext
	readonly role: RequestRoleReference
}

/** Allows official or community providers to resolve request-local role membership. */
export interface RequestRoleResolver {
	hasRole(input: RequestRoleResolutionInput): MaybePromise<boolean>
	/**
	 * Converts a logical role selector into its stable schema-qualified storage identity.
	 *
	 * Persisted policy providers require this optional capability only when their
	 * value contains role references. `undefined` rejects an unknown role.
	 */
	resolvePersistentRole?(
		input: RequestRoleResolutionInput,
	): MaybePromise<RequestRoleReference | undefined>
	/**
	 * Lists stable role references held by the current request principal.
	 *
	 * Row-level providers use this optional capability when candidate role
	 * references live inside persisted rows and are therefore unknown before SQL.
	 */
	resolveCurrentRoles?(
		input: RequestPrincipalResolutionInput,
	): MaybePromise<readonly RequestRoleReference[] | undefined>
}

/**
 * Identifies the optional neutral role resolver shared by permission providers.
 *
 * A persisted row-policy plugin requires this capability only when its
 * configured policy contains a role subject.
 */
export const requestRoleResolverCapability: CapabilityToken<
	RequestRoleResolver,
	RequestRoleResolver,
	'ultimabase.request-subject.role-resolver',
	'1.0.0',
	'single',
	'application'
> = defineCapability<RequestRoleResolver>()({
	capabilityId: 'ultimabase.request-subject.role-resolver',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([provider]) => provider,
})

/** Extracts the exact resolved value supplied by one neutral resolver. */
export type ResolvedRequestSubject<TResolver> =
	TResolver extends RequestSubjectResolver<unknown, infer TSubject>
		? TSubject
		: never
