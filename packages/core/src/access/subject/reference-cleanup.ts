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
import type { AccessContext } from '../request/context.js'
import type { AccessSubjectReference } from './contracts.js'

/** Supplies one transactional reference inspection or cleanup callback. */
export interface AccessReferenceCleanupInput<
	TReference extends AccessSubjectReference<string, string | number> =
		AccessSubjectReference<string, string | number>,
> {
	/** Carries the current request authority and plugin-owned context values. */
	readonly context: AccessContext
	/** Identifies the exact subject whose persisted references are being inspected. */
	readonly reference: TReference
}

/** Lets an independent plugin participate in subject-reference deletion safely. */
export interface AccessReferenceCleanup<
	TKind extends string = string,
	TReference extends AccessSubjectReference<TKind, string | number> =
		AccessSubjectReference<TKind, string | number>,
> {
	/** Selects the neutral subject kind handled by this contribution. */
	readonly kind: TKind
	/** Reports whether at least one external persisted reference remains. */
	hasReferences(
		input: AccessReferenceCleanupInput<TReference>,
	): MaybePromise<boolean>
	/** Removes only references owned by the contributing plugin. */
	cleanup(input: AccessReferenceCleanupInput<TReference>): MaybePromise<void>
}

const accessReferenceCleanups = new WeakSet<object>()

/**
 * Defines an explicit, provider-neutral reference cleanup contribution.
 *
 * Provide the returned value through `accessReferenceCleanupCapability`; a
 * subject provider can discover it without importing the consumer that owns
 * the persisted data.
 *
 * @example
 * ```ts
 * provideCapability(accessReferenceCleanupCapability, {
 *   contributionId: 'acl.role-references',
 *   create: () => ({ value: {
 *     name: 'acl.role-references',
 *     cleanup: defineAccessReferenceCleanup({
 *       kind: 'role',
 *       hasReferences: ({ reference }) => aclStore.hasSubject(reference.value),
 *       cleanup: ({ reference }) => aclStore.removeSubject(reference.value),
 *     }),
 *   } }),
 * })
 * ```
 */
export const defineAccessReferenceCleanup = <
	const TKind extends string,
	const TReference extends AccessSubjectReference<TKind, string | number> =
		AccessSubjectReference<TKind, string | number>,
>(
	definition: AccessReferenceCleanup<TKind, TReference>,
): Readonly<AccessReferenceCleanup<TKind, TReference>> => {
	assertNonEmptyString(definition.kind, 'reference cleanup kind')

	if (typeof definition.hasReferences !== 'function') {
		throw new TypeError('reference cleanup hasReferences must be a function')
	}

	if (typeof definition.cleanup !== 'function') {
		throw new TypeError('reference cleanup cleanup must be a function')
	}

	const normalized = immutableRecord(definition)
	accessReferenceCleanups.add(normalized)

	return normalized
}

/** Narrows setup contributions to values created by the public factory. */
export const isAccessReferenceCleanup = (
	value: unknown,
): value is AccessReferenceCleanup =>
	typeof value === 'object' &&
	value !== null &&
	accessReferenceCleanups.has(value)

/** Retains one stable local name beside a validated reference cleanup. */
export interface NamedAccessReferenceCleanup {
	readonly cleanup: AccessReferenceCleanup
	readonly name: string
}

/** Composes independent subject-reference cleanup providers in graph order. */
export const accessReferenceCleanupCapability: CapabilityToken<
	NamedAccessReferenceCleanup,
	readonly NamedAccessReferenceCleanup[],
	'ultimabase.access.reference-cleanup',
	'1.0.0',
	'multiple',
	'application'
> = defineCapability<
	NamedAccessReferenceCleanup,
	readonly NamedAccessReferenceCleanup[]
>()({
	capabilityId: 'ultimabase.access.reference-cleanup',
	version: '1.0.0',
	cardinality: 'multiple',
	lifetime: 'application',
	compose: (providers) =>
		immutableArray(
			providers.map((provider) => {
				assertNonEmptyString(provider.name, 'reference cleanup name')
				if (!isAccessReferenceCleanup(provider.cleanup)) {
					throw new TypeError(
						'reference cleanup capability requires a factory-created cleanup',
					)
				}

				return immutableRecord(provider)
			}),
		),
})
