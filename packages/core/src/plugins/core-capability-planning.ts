import { isApplicationRequestExecutionCapability } from '../runtime/application/application-request-execution.js'
import { isApplicationOperationTransportPlanningCapability } from '../runtime/application/application-operation-transport-planning.js'
import { isApplicationSchemaMutationSurfaceCapability } from '../runtime/application/application-schema-mutation-surface.js'
import type { MutableCapabilityEntry } from './capability-inventory.js'
import { throwCapabilityConflict } from './capability-conflict.js'
import { formatPluginIdentity } from './manifest.js'

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
	if (isApplicationSchemaMutationSurfaceCapability(entry.token)) {
		return {
			kind: 'application-schema-mutation-surface',
			name: 'Application schema mutation surface',
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

	throwCapabilityConflict(`${capability.name} is provided only by Core.`, {
		kind: `${capability.kind}-provider-forbidden`,
		plugin: formatPluginIdentity(pluginProvider.owner),
		contributionId: pluginProvider.declaration.contributionId,
	})
}
