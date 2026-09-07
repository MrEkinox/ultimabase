import { FrameworkError } from '../errors/framework-error.js'
import { isApplicationRequestExecutionCapability } from '../runtime/application/application-request-execution.js'
import { isApplicationOperationTransportPlanningCapability } from '../runtime/application/application-operation-transport-planning.js'
import type {
	MutableCapabilityEntry,
	OwnedDecorator,
	OwnedProvider,
} from './capability-inventory.js'
import { formatPluginIdentity } from './manifest.js'

const throwCoreCapabilityConflict = (
	message: string,
	internalDetails: Readonly<Record<string, unknown>>,
): never => {
	throw new FrameworkError('PLUGIN_CAPABILITY_CONFLICT', message, {
		internalDetails,
	})
}

const coreCapabilityDescription = (
	entry: MutableCapabilityEntry,
): Readonly<{ readonly kind: string; readonly name: string }> | undefined => {
	if (isApplicationRequestExecutionCapability(entry.token)) {
		return {
			kind: 'application-request',
			name: 'Application request execution',
		}
	}
	if (isApplicationOperationTransportPlanningCapability(entry.token)) {
		return {
			kind: 'application-operation-transport-planning',
			name: 'Application operation transport planning',
		}
	}
	return undefined
}

/** Prevents plugins from providing one Core-owned execution protocol. */
export const assertCoreCapabilityProviders = (
	entry: MutableCapabilityEntry,
): void => {
	const capability = coreCapabilityDescription(entry)
	if (capability === undefined) return
	const pluginProvider = entry.providers.find(
		(provider) => provider.plugin !== undefined,
	)
	if (pluginProvider === undefined) return

	throwCoreCapabilityConflict(`${capability.name} is provided only by Core.`, {
		kind: `${capability.kind}-provider-forbidden`,
		plugin: formatPluginIdentity(pluginProvider.owner),
		contributionId: pluginProvider.declaration.contributionId,
	})
}

/** Prevents generic replacement from changing Core-owned request execution. */
export const assertCoreCapabilityReplacementAllowed = (
	entry: MutableCapabilityEntry,
	replacement: OwnedProvider,
): void => {
	const capability = coreCapabilityDescription(entry)
	if (capability === undefined) return

	throwCoreCapabilityConflict(`${capability.name} cannot be replaced.`, {
		kind: `${capability.kind}-replacement-forbidden`,
		plugin: formatPluginIdentity(replacement.owner),
		contributionId: replacement.declaration.contributionId,
	})
}

/** Prevents generic decoration from observing the private execution binding. */
export const assertCoreCapabilityDecorationAllowed = (
	entry: MutableCapabilityEntry,
	decorator: OwnedDecorator,
): void => {
	const capability = coreCapabilityDescription(entry)
	if (capability === undefined) return

	throwCoreCapabilityConflict(`${capability.name} cannot be decorated.`, {
		kind: `${capability.kind}-decoration-forbidden`,
		plugin: formatPluginIdentity(decorator.owner),
		contributionId: decorator.declaration.contributionId,
	})
}
