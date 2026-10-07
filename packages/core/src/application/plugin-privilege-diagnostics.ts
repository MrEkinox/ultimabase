import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import {
	formatPluginIdentity,
	pluginPrivilegeMetadata,
	type PluginIdentity,
	type PluginPrivilege,
	type PluginPrivilegeSeverity,
} from '../plugins/manifest.js'
import type {
	PluginPrivilegeLogger,
	PluginPrivilegePluginReport,
	PluginPrivilegeReport,
} from './plugin-privilege-policy.js'

const blockedPhase = 'before-static-declaration' as const

interface InactivePluginPrivilegeDetails extends Readonly<
	Record<string, unknown>
> {
	readonly blockedPhase: 'core-facade'
	readonly identity: PluginIdentity
	readonly kind: 'inactive-plugin-privilege'
	readonly plugin: string
	readonly privilege: PluginPrivilege
	readonly reason: string
	readonly severity: PluginPrivilegeSeverity
}

const snapshotIdentity = (identity: PluginIdentity): PluginIdentity =>
	immutableRecord({
		pluginId: identity.pluginId,
		...(identity.instanceId === undefined
			? {}
			: { instanceId: identity.instanceId }),
	})

const denialDetails = (
	plugin: PluginPrivilegePluginReport,
	name: string,
	reason: string,
	severity: PluginPrivilegeSeverity,
) =>
	immutableRecord({
		blockedPhase,
		identity: snapshotIdentity(plugin.identity),
		name,
		plugin: formatPluginIdentity(plugin.identity),
		reason,
		severity,
	})

/** Creates one effect-time denial without exposing manifest or application state. */
export const inactivePrivilegeDetails = (
	owner: PluginIdentity,
	privilege: PluginPrivilege,
	reason: string | undefined,
): InactivePluginPrivilegeDetails =>
	immutableRecord({
		blockedPhase: 'core-facade' as const,
		identity: snapshotIdentity(owner),
		kind: 'inactive-plugin-privilege' as const,
		plugin: formatPluginIdentity(owner),
		privilege,
		reason: reason ?? 'Plugin manifest does not request this privilege.',
		severity: pluginPrivilegeMetadata[privilege].severity,
	})

/** Reports policy once while isolating synchronous and asynchronous logger failures. */
export const emitPolicyReport = (
	logger: PluginPrivilegeLogger | false,
	report: PluginPrivilegeReport,
): void => {
	if (logger === false) return

	try {
		const result = report.allowed ? logger.info(report) : logger.error(report)
		void Promise.resolve(result).catch(() => undefined)
	} catch {
		// Diagnostics must never replace the policy result they describe.
	}
}

/** Throws one aggregate denial with exact owner, reason, severity, and phase. */
export const assertPolicyAllowed = (report: PluginPrivilegeReport): void => {
	if (report.allowed) return

	const denials = report.plugins.flatMap((plugin) => [
		...plugin.privileges
			.filter(
				(privilege) => privilege.active && privilege.policyResult === 'denied',
			)
			.map((privilege) =>
				immutableRecord({
					kind: 'privilege' as const,
					...denialDetails(
						plugin,
						privilege.name,
						privilege.reason,
						privilege.severity,
					),
				}),
			),
		...plugin.environment
			.filter((claim) => claim.policyResult === 'denied')
			.map((claim) =>
				immutableRecord({
					kind: 'environment-claim' as const,
					...denialDetails(plugin, claim.name, claim.reason, claim.severity),
				}),
			),
	])

	throw new FrameworkError(
		'PLUGIN_PRIVILEGE_DENIED',
		`Plugin privilege policy denied ${String(denials.length)} active request${denials.length === 1 ? '' : 's'}.`,
		{ internalDetails: { denials: immutableArray(denials) } },
	)
}
