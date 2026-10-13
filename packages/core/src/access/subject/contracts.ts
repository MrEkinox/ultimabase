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

/**
 * Identifies the optional principal provider without naming authentication.
 * Core resolves its answer once per request (`getRequestPrincipal`, ADR-0304).
 */
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
	hint: 'Add an authentication plugin that resolves the current principal to UltimaBase.use(...).',
})

/**
 * Identifies one policy-domain subject without naming its provider plugin.
 *
 * The kind belongs to the permission provider while the value may be a stable
 * key, an object identifier, or another immutable application reference.
 *
 * @example `new RequestSubjectReference('group', 'editors')`
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

/** Supplies one request-local subject lookup to a provider-owned resolver. */
export interface RequestSubjectResolutionInput<TReference> {
	readonly context: RequestSubjectContext
	readonly reference: TReference
}

/**
 * Resolves a neutral policy reference without exposing its provider plugin.
 *
 * `undefined` is the fail-closed result for unavailable dynamic identity data.
 */
export interface RequestSubjectResolver<TReference, TSubject> {
	resolve(
		input: RequestSubjectResolutionInput<TReference>,
	): MaybePromise<TSubject | undefined>
}

/** Extracts the exact resolved value supplied by one neutral resolver. */
export type ResolvedRequestSubject<TResolver> =
	TResolver extends RequestSubjectResolver<unknown, infer TSubject>
		? TSubject
		: never
