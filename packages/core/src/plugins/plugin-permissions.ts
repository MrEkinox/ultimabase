import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
} from '@ultimabase/shared'

import { assertPlainObject } from '../exact-object-validation.js'
import {
	pluginPrivilegeMetadata,
	pluginPrivilegeNames,
	type PluginPrivilege,
	type PluginPrivilegeRequest,
} from './manifest.js'

/**
 * Optional human-readable reasons for privileges Core derives from contributions.
 *
 * Core reports a generated description for every derived privilege without a
 * reason. The critical privileges `authority:elevate` and `storage:private`
 * are the exception: a plugin that derives one of them must explain it here.
 * A reason for a privilege the plugin does not derive is rejected.
 *
 * @example
 * ```ts
 * const permissions: PluginPermissionReasons = {
 * 	'storage:private': 'Stores revocable session verifiers.',
 * }
 * ```
 */
export type PluginPermissionReasons = Readonly<
	Partial<Record<PluginPrivilege, string>>
>

/**
 * @internal Names one privilege implied by a contribution and the short report
 * sentence shown when the plugin gives no reason.
 */
export interface DerivedPluginPrivilege {
	readonly privilege: PluginPrivilege
	readonly description: string
}

/** Critical privileges change who may act or what data a plugin owns. */
const requiresExplicitReason = (privilege: PluginPrivilege): boolean =>
	pluginPrivilegeMetadata[privilege].severity === 'critical'

/**
 * @internal Validates optional author reasons against the derived privileges
 * and returns one request per derived privilege in vocabulary order, so the
 * report does not depend on contribution order.
 */
export const normalizePluginPermissionRequests = (
	permissions: PluginPermissionReasons | undefined,
	derived: readonly DerivedPluginPrivilege[],
): readonly PluginPrivilegeRequest[] => {
	const untrustedPermissions: unknown = permissions ?? {}
	assertPlainObject(
		untrustedPermissions,
		'plugin permissions must be a plain object',
	)
	for (const key of Reflect.ownKeys(untrustedPermissions)) {
		if (
			typeof key !== 'string' ||
			!Object.hasOwn(pluginPrivilegeMetadata, key)
		) {
			throw new TypeError(`Unknown plugin permission reason: ${String(key)}`)
		}
		if (!derived.some(({ privilege }) => privilege === key)) {
			throw new TypeError(`Unused plugin permission reason: ${key}`)
		}
		assertNonEmptyString(untrustedPermissions[key], `plugin permissions.${key}`)
	}

	return immutableArray(
		pluginPrivilegeNames.flatMap((name) => {
			const descriptions = new Set(
				derived
					.filter(({ privilege }) => privilege === name)
					.map(({ description }) => description),
			)
			if (descriptions.size === 0) return []
			const reason: unknown = untrustedPermissions[name]
			if (typeof reason === 'string') return [immutableRecord({ name, reason })]
			if (requiresExplicitReason(name)) {
				throw new TypeError(
					`Missing plugin permission reason: ${name} is critical and must be declared in permissions with a non-empty reason`,
				)
			}
			return [immutableRecord({ name, reason: [...descriptions].join(' ') })]
		}),
	)
}
