import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import {
	formatPluginIdentity,
	pluginPrivilegeMetadata,
	snapshotPluginIdentity,
	type PluginIdentity,
	type PluginPrivilege,
	type PluginPrivilegeSeverity,
} from '../plugins/manifest.js'
import type { ApplicationLog } from './application-log.js'
import type {
	PluginPrivilegePluginReport,
	PluginPrivilegeReport,
} from './plugin-privilege-policy.js'

const blockedPhase = 'before-static-declaration' as const

interface MissingPluginPrivilegeDetails extends Readonly<
	Record<string, unknown>
> {
	readonly blockedPhase: 'core-facade'
	readonly identity: PluginIdentity
	readonly kind: 'missing-plugin-privilege'
	readonly plugin: string
	readonly privilege: PluginPrivilege
	readonly reason: string
	readonly severity: PluginPrivilegeSeverity
}

const denialDetails = (
	plugin: PluginPrivilegePluginReport,
	name: string,
	reason: string,
	severity: PluginPrivilegeSeverity,
) =>
	immutableRecord({
		blockedPhase,
		identity: snapshotPluginIdentity(plugin.identity),
		name,
		plugin: formatPluginIdentity(plugin.identity),
		reason,
		severity,
	})

/** Creates one effect-time denial without exposing manifest or application state. */
export const missingPrivilegeDetails = (
	owner: PluginIdentity,
	privilege: PluginPrivilege,
): MissingPluginPrivilegeDetails =>
	immutableRecord({
		blockedPhase: 'core-facade' as const,
		identity: snapshotPluginIdentity(owner),
		kind: 'missing-plugin-privilege' as const,
		plugin: formatPluginIdentity(owner),
		privilege,
		reason: 'Plugin manifest does not request this privilege.',
		severity: pluginPrivilegeMetadata[privilege].severity,
	})

/**
 * Logs the complete report at `debug`, or at `error` before a denial fails the
 * application (ADR-0313); the start summary line names critical privileges.
 */
export const emitPolicyReport = (
	log: ApplicationLog,
	report: PluginPrivilegeReport,
): void => {
	if (report.allowed) {
		log.debug('UltimaBase plugin privilege report', report)
	} else {
		log.error('UltimaBase plugin privilege report', report)
	}
}

/** Throws one aggregate denial with exact owner, reason, severity, and phase. */
export const assertPolicyAllowed = (report: PluginPrivilegeReport): void => {
	if (report.allowed) return

	const denials = report.plugins.flatMap((plugin) => [
		...plugin.privileges
			.filter((privilege) => privilege.policyResult === 'denied')
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
