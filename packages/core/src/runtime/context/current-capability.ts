import { immutableRecord } from '@ultimabase/shared'

import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import { runWithApplicationPluginOwner } from '../../plugins/callback-execution.js'
import type {
	CapabilityProviderValue,
	CapabilityToken,
} from '../../plugins/capability-token.js'
import { getCurrentEngine } from './active-framework-context.js'
import { readRequestEngineApplication } from '../engine/request-engine.js'

/** The provider of one capability for the active request's application. */
export interface CurrentCapabilityProvider<TToken extends CapabilityToken> {
	/** The value the providing plugin contributed. */
	readonly value: CapabilityProviderValue<TToken>
	/**
	 * Runs one callback attributed to the providing plugin, so its privileges
	 * apply as when Core calls the provider itself.
	 */
	run<TResult>(callback: () => TResult): TResult
}

/**
 * Reads the first provider of an application capability for the active
 * request, or `undefined` when no installed plugin provides it. Plugins use
 * it to call a protocol another plugin provides, at request time (ADR-0329).
 *
 * @example `readCurrentCapabilityProvider(token)?.run(() => provider.value.check(input))`
 */
export const readCurrentCapabilityProvider = <
	const TToken extends CapabilityToken,
>(
	token: TToken,
): CurrentCapabilityProvider<TToken> | undefined => {
	const application = readRequestEngineApplication(getCurrentEngine())
	const contribution =
		readApplicationKernelState(application).capabilityContributions(token)[0]
	if (contribution === undefined) return undefined
	return immutableRecord({
		value: contribution.value,
		run: <TResult>(callback: () => TResult): TResult =>
			runWithApplicationPluginOwner(application, contribution.owner, callback),
	})
}
