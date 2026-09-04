import { FrameworkError } from '../errors/framework-error.js'
import { isApplicationRequestExecutionCapability } from '../runtime/application/application-request-execution.js'
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

/** Prevents plugins from providing one Core-owned execution protocol. */
export const assertCoreCapabilityProviders = (
	entry: MutableCapabilityEntry,
): void => {
	if (!isApplicationRequestExecutionCapability(entry.token)) return
	const pluginProvider = entry.providers.find(
		(provider) => provider.plugin !== undefined,
	)
	if (pluginProvider === undefined) return

	throwCoreCapabilityConflict(
		'Application request execution is provided only by Core.',
		{
			kind: 'application-request-provider-forbidden',
			plugin: formatPluginIdentity(pluginProvider.owner),
			contributionId: pluginProvider.declaration.contributionId,
		},
	)
}

/** Prevents generic replacement from changing Core-owned request execution. */
export const assertCoreCapabilityReplacementAllowed = (
	entry: MutableCapabilityEntry,
	replacement: OwnedProvider,
): void => {
	if (!isApplicationRequestExecutionCapability(entry.token)) return

	throwCoreCapabilityConflict(
		'Application request execution cannot be replaced.',
		{
			kind: 'application-request-replacement-forbidden',
			plugin: formatPluginIdentity(replacement.owner),
			contributionId: replacement.declaration.contributionId,
		},
	)
}

/** Prevents generic decoration from observing the private execution binding. */
export const assertCoreCapabilityDecorationAllowed = (
	entry: MutableCapabilityEntry,
	decorator: OwnedDecorator,
): void => {
	if (!isApplicationRequestExecutionCapability(entry.token)) return

	throwCoreCapabilityConflict(
		'Application request execution cannot be decorated.',
		{
			kind: 'application-request-decoration-forbidden',
			plugin: formatPluginIdentity(decorator.owner),
			contributionId: decorator.declaration.contributionId,
		},
	)
}
