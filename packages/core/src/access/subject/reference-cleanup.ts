import {
	assertNonEmptyString,
	immutableRecord,
	type MaybePromise,
} from '@ultimabase/shared'

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
 * Register the returned value in `registries.commands`; a subject provider can
 * discover it without importing the consumer that owns the persisted data.
 *
 * @example
 * ```ts
 * registries.commands.register('acl.role-references', defineAccessReferenceCleanup({
 *   kind: 'role',
 *   hasReferences: ({ reference }) => aclStore.hasSubject(reference.value),
 *   cleanup: ({ reference }) => aclStore.removeSubject(reference.value),
 * }))
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
