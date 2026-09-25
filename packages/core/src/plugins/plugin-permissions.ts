import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { CapabilityRequirement } from './capabilities.js'
import {
	pluginPrivilegeMetadata,
	type PluginPrivilege,
	type PluginPrivilegeRequest,
} from './manifest.js'

/** Keeps reasons explicit while Core derives which names are required. */
export type PluginPermissionReason =
	| string
	| Readonly<{
			readonly reason: string
			readonly when?: CapabilityRequirement
	  }>

export type PluginPermissionReasons = Readonly<
	Partial<Record<PluginPrivilege, PluginPermissionReason>>
>

/** @internal Validates exact reasons in author order after contribution analysis. */
export const normalizePluginPermissionRequests = (
	permissions: PluginPermissionReasons | undefined,
	requiredPrivileges: readonly PluginPrivilege[],
): readonly PluginPrivilegeRequest[] => {
	const untrustedPermissions: unknown = permissions ?? {}
	if (!isPlainRecord(untrustedPermissions)) {
		throw new TypeError('plugin permissions must be a plain object')
	}
	for (const key of Reflect.ownKeys(untrustedPermissions)) {
		if (
			typeof key !== 'string' ||
			!Object.hasOwn(pluginPrivilegeMetadata, key)
		) {
			throw new TypeError(`Unknown plugin permission reason: ${String(key)}`)
		}
		if (!requiredPrivileges.includes(key as PluginPrivilege)) {
			throw new TypeError(`Unused plugin permission reason: ${key}`)
		}
	}
	for (const privilege of requiredPrivileges) {
		if (!Object.hasOwn(untrustedPermissions, privilege)) {
			throw new TypeError(`Missing plugin permission reason: ${privilege}`)
		}
	}

	return immutableArray(
		Object.keys(untrustedPermissions).map((key) => {
			const name = key as PluginPrivilege
			const configured = untrustedPermissions[name]
			if (typeof configured === 'string') {
				assertNonEmptyString(configured, `plugin permissions.${name}`)
				return immutableRecord({ name, reason: configured })
			}
			if (!isPlainRecord(configured)) {
				throw new TypeError(
					`plugin permissions.${name} must be a reason or conditional reason`,
				)
			}
			for (const key of Reflect.ownKeys(configured)) {
				if (key !== 'reason' && key !== 'when') {
					throw new TypeError(
						`Unknown plugin permissions.${name} option: ${String(key)}`,
					)
				}
			}
			assertNonEmptyString(
				configured.reason,
				`plugin permissions.${name}.reason`,
			)
			return immutableRecord({
				name,
				reason: configured.reason,
				...(configured.when === undefined ? {} : { when: configured.when }),
			})
		}),
	)
}
