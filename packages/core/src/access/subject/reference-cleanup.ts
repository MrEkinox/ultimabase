import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import {
	defineCapability,
	type CapabilityToken,
} from '../../plugins/capabilities.js'
import type { RequestSubjectContext } from '../request/context.js'
import type { RequestSubjectReference } from './contracts.js'

/** Supplies one transactional reference inspection or cleanup callback. */
export interface RequestSubjectReferenceCleanupInput<
	TReference extends RequestSubjectReference<string, string | number> =
		RequestSubjectReference<string, string | number>,
> {
	/** Carries the current request authority and plugin-owned context values. */
	readonly context: RequestSubjectContext
	/** Identifies the exact subject whose persisted references are being inspected. */
	readonly reference: TReference
}

/** Lets an independent plugin participate in subject-reference deletion safely. */
export interface RequestSubjectReferenceCleanup<
	TKind extends string = string,
	TReference extends RequestSubjectReference<TKind, string | number> =
		RequestSubjectReference<TKind, string | number>,
> {
	/** Selects the neutral subject kind handled by this contribution. */
	readonly kind: TKind
	/** Reports whether at least one external persisted reference remains. */
	hasReferences(
		input: RequestSubjectReferenceCleanupInput<TReference>,
	): MaybePromise<boolean>
	/** Removes only references owned by the contributing plugin. */
	cleanup(
		input: RequestSubjectReferenceCleanupInput<TReference>,
	): MaybePromise<void>
}

const requestSubjectReferenceCleanups = new WeakSet<object>()

/**
 * Defines an explicit, provider-neutral reference cleanup contribution.
 *
 * Provide the returned value through `requestSubjectReferenceCleanupCapability`; a
 * subject provider can discover it without importing the consumer that owns
 * the persisted data.
 *
 * @example
 * ```ts
 * provideCapability(requestSubjectReferenceCleanupCapability, {
 *   contributionId: 'acl.role-references',
 *   create: () => ({ value: {
 *     name: 'acl.role-references',
 *     cleanup: defineRequestSubjectReferenceCleanup({
 *       kind: 'role',
 *       hasReferences: ({ reference }) => aclStore.hasSubject(reference.value),
 *       cleanup: ({ reference }) => aclStore.removeSubject(reference.value),
 *     }),
 *   } }),
 * })
 * ```
 */
export const defineRequestSubjectReferenceCleanup = <
	const TKind extends string,
	const TReference extends RequestSubjectReference<TKind, string | number> =
		RequestSubjectReference<TKind, string | number>,
>(
	definition: RequestSubjectReferenceCleanup<TKind, TReference>,
): Readonly<RequestSubjectReferenceCleanup<TKind, TReference>> => {
	assertNonEmptyString(definition.kind, 'reference cleanup kind')

	if (typeof definition.hasReferences !== 'function') {
		throw new TypeError('reference cleanup hasReferences must be a function')
	}

	if (typeof definition.cleanup !== 'function') {
		throw new TypeError('reference cleanup cleanup must be a function')
	}

	const normalized = immutableRecord(definition)
	requestSubjectReferenceCleanups.add(normalized)

	return normalized
}

/** Narrows setup contributions to values created by the public factory. */
export const isRequestSubjectReferenceCleanup = (
	value: unknown,
): value is RequestSubjectReferenceCleanup =>
	typeof value === 'object' &&
	value !== null &&
	requestSubjectReferenceCleanups.has(value)

/** Retains one stable local name beside a validated reference cleanup. */
export interface NamedRequestSubjectReferenceCleanup {
	readonly cleanup: RequestSubjectReferenceCleanup
	readonly name: string
}

/** Composes independent subject-reference cleanup providers in graph order. */
export const requestSubjectReferenceCleanupCapability: CapabilityToken<
	NamedRequestSubjectReferenceCleanup,
	readonly NamedRequestSubjectReferenceCleanup[],
	'ultimabase.request-subject.reference-cleanup',
	'1.0.0',
	'multiple',
	'application'
> = defineCapability<
	NamedRequestSubjectReferenceCleanup,
	readonly NamedRequestSubjectReferenceCleanup[]
>()({
	capabilityId: 'ultimabase.request-subject.reference-cleanup',
	version: '1.0.0',
	cardinality: 'multiple',
	lifetime: 'application',
	compose: (providers) =>
		immutableArray(
			providers.map((provider) => {
				assertNonEmptyString(provider.name, 'reference cleanup name')
				if (!isRequestSubjectReferenceCleanup(provider.cleanup)) {
					throw new TypeError(
						'reference cleanup capability requires a factory-created cleanup',
					)
				}

				return immutableRecord(provider)
			}),
		),
})
