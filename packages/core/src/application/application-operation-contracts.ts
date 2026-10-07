import { immutableRecord } from '@ultimabase/shared'

import type {
	PluginOperationDefinition,
	PluginOperationInput,
} from '../plugins/plugin-operations.js'
import type { PluginSchemaContributionOwner } from '../schema/schema/provenance.js'

/** Exposes safe owner facts without plugin configuration or execution state. */
export interface ApplicationContributionOwner {
	readonly instanceId?: string
	readonly pluginId: string
	readonly version: string
}

/** Identifies the application targeted by a plugin operation envelope. */
export type PluginOperationEnvelopeTarget = Readonly<{
	readonly kind: 'application'
}>

/** Carries one validated logical operation without executing or exposing it. */
export interface PluginOperationEnvelope<
	TOperation extends PluginOperationDefinition = PluginOperationDefinition,
> {
	readonly kind: 'plugin-operation'
	readonly name: TOperation['name']
	readonly payload: PluginOperationInput<TOperation>
	readonly target: PluginOperationEnvelopeTarget
	readonly transaction: TOperation['transaction']
	readonly version: TOperation['version']
}

/** Creates detached public owner metadata from one compiled contribution. */
export const snapshotApplicationContributionOwner = (
	owner: PluginSchemaContributionOwner,
): ApplicationContributionOwner =>
	immutableRecord({
		...(owner.instanceId === undefined ? {} : { instanceId: owner.instanceId }),
		pluginId: owner.pluginId,
		version: owner.version,
	})
