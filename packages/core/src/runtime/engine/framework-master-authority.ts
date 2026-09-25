import { FrameworkError } from '../../errors/framework-error.js'
import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import { readApplicationPluginOwner } from '../../plugins/callback-execution.js'
import type { MasterAuthority } from '../master/master-authority.js'

const masterAuthorities = new WeakMap<object, MasterAuthority>()

/** Binds one configured authority to the exact immutable framework shell. */
export const bindFrameworkMasterAuthority = (
	framework: object,
	authority: MasterAuthority,
): void => {
	masterAuthorities.set(framework, authority)
}

/** Requires the configured authority only when a trusted elevation is requested. */
export const getFrameworkMasterAuthority = (
	framework: object,
): MasterAuthority => {
	const authority = masterAuthorities.get(framework)

	if (authority === undefined) {
		throw new FrameworkError(
			'PERMISSION_DENIED',
			'Master authority is not configured for this framework engine.',
			{ publicMessage: 'Master authority is not available.' },
		)
	}

	return authority
}

/** Reads optional configuration solely for explicit-context provenance binding. */
export const readFrameworkMasterAuthority = (
	framework: object,
): MasterAuthority | undefined => masterAuthorities.get(framework)

/** Checks the exact active plugin owner before audit or another elevation effect. */
export const assertMasterElevationPrivilege = (application: object): void => {
	const owner = readApplicationPluginOwner(application)

	if (owner !== undefined) {
		readApplicationKernelState(application).assertPrivilege(
			owner,
			'authority:elevate',
		)
	}
}
