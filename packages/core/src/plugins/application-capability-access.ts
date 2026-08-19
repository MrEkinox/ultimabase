import type {
	CapabilityConsumerValue,
	CapabilityToken,
} from './capabilities.js'
import type { ApplicationCapabilityHost } from './capability-host.js'
import type { MaterializedCapabilityContribution } from './capability-host.js'

const capabilityHosts = new WeakMap<object, ApplicationCapabilityHost>()

/** Binds private Core capability reads to one exact application instance. */
export const bindApplicationCapabilityHost = (
	application: object,
	host: ApplicationCapabilityHost,
): void => {
	if (capabilityHosts.has(application)) {
		throw new TypeError('Application capability host is already bound')
	}
	capabilityHosts.set(application, host)
}

/** Reads one exact Core-owned capability without opening plugin lookup. */
export const readApplicationCapability = <const TToken extends CapabilityToken>(
	application: object,
	token: TToken,
): CapabilityConsumerValue<TToken> | undefined => {
	const host = capabilityHosts.get(application)
	if (host === undefined) {
		throw new TypeError('Unknown application capability host')
	}

	return host.read(token)
}

/** Reads exact materialized providers with Core-retained ownership metadata. */
export const readApplicationCapabilityContributions = <
	const TToken extends CapabilityToken,
>(
	application: object,
	token: TToken,
): readonly MaterializedCapabilityContribution<TToken>[] => {
	const host = capabilityHosts.get(application)
	if (host === undefined) {
		throw new TypeError('Unknown application capability host')
	}

	return host.readContributions(token)
}
