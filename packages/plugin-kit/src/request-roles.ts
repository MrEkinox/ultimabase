import {
	FrameworkError,
	RequestSubjectReference,
	type RequestPrincipalResolutionInput,
	type RequestSubjectContext,
} from '@ultimabase/core'
import {
	defineCapability,
	readCurrentCapabilityProvider,
	type CapabilityToken,
} from '@ultimabase/core/plugin'
import { immutableRecord, type MaybePromise } from '@ultimabase/shared'

/**
 * The role contract shared by permission providers (ACL) and the role
 * provider (Roles) so they meet without importing each other (ADR-0329).
 * Core stores and cleans neutral subject references; it never names roles.
 */

/** Describes the neutral reference shape consumed by role-aware policies. */
export type RequestRoleReference<TValue extends string | number = string> =
	RequestSubjectReference<'role', TValue>

/**
 * The role subject accepted by role-aware policies: a reference created by
 * the role provider (results carry no methods, ADR-0310).
 */
export type RequestRoleSubject = RequestRoleReference

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
 *
 * @example `const { value } = resolveRequestRoleReference(role)`
 */
export const resolveRequestRoleReference = (
	subject: RequestRoleSubject,
): RequestRoleReference => {
	const reference: unknown = subject

	if (!isRequestRoleReference(reference)) {
		throw new TypeError(
			'Request role subject must provide one string role reference',
		)
	}

	return reference
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
 *
 * @example `provideCapability(requestRoleResolverCapability, { contributionId: 'roles', create: () => ({ value: resolver }) })`
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
	hint: 'Add a plugin that resolves request roles to UltimaBase.use(...).',
})

const attributedResolvers = new WeakMap<object, RequestRoleResolver>()

/**
 * Resolves the role capability of the active request's application. Every
 * resolver call keeps the contributing plugin's privilege attribution.
 *
 * @example `await requireCurrentRequestRoleResolver().hasRole({ context, role })`
 */
export const requireCurrentRequestRoleResolver = (): RequestRoleResolver => {
	const provider = readCurrentCapabilityProvider(requestRoleResolverCapability)
	if (provider === undefined) {
		const { capabilityId, hint } = requestRoleResolverCapability
		throw new FrameworkError(
			'PLUGIN_CAPABILITY_MISSING',
			`Active application requires a request role resolver capability.${hint === undefined ? '' : ` ${hint}`}`,
			{
				internalDetails: {
					capabilityId,
					requiredVersion: '^1.0.0',
					...(hint === undefined ? {} : { hint }),
				},
			},
		)
	}
	const resolver = provider.value
	const existing = attributedResolvers.get(resolver)
	if (existing !== undefined) return existing

	const attribute =
		<TInput, TResult>(method: (input: TInput) => TResult) =>
		(input: TInput): TResult =>
			provider.run(() => method(input))
	const resolvePersistentRole = resolver.resolvePersistentRole?.bind(resolver)
	const resolveCurrentRoles = resolver.resolveCurrentRoles?.bind(resolver)
	const attributed: RequestRoleResolver = immutableRecord({
		hasRole: attribute((input: RequestRoleResolutionInput) =>
			resolver.hasRole(input),
		),
		...(resolvePersistentRole === undefined
			? {}
			: { resolvePersistentRole: attribute(resolvePersistentRole) }),
		...(resolveCurrentRoles === undefined
			? {}
			: { resolveCurrentRoles: attribute(resolveCurrentRoles) }),
	})
	attributedResolvers.set(resolver, attributed)
	return attributed
}
