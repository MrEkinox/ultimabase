import { immutableRecord } from '@ultimabase/shared'

import type { PluginOperationDefinition } from '../plugins/plugin-operations.js'
import type { SchemaDefinition } from '../schema/schema/definition.js'
import type { PluginSchemaContributionOwner } from '../schema/schema/provenance.js'
import type { PluginOperationInput } from '../plugins/plugin-operations.js'

/** Exposes safe owner facts without plugin configuration or execution state. */
export interface ApplicationContributionOwner {
	readonly instanceId?: string
	readonly pluginId: string
	readonly version: string
}

/** Identifies the application, schema, or immutable model bound to an envelope. */
export type PluginOperationEnvelopeTarget =
	| Readonly<{ readonly kind: 'application' }>
	| Readonly<{ readonly kind: 'schema'; readonly schema?: string }>
	| Readonly<{
			readonly kind: 'model'
			readonly schema?: string
			readonly state?: 'draft' | 'persisted'
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

/** Retains the exact schema or model selected by an application-owned handle. */
export interface ApplicationOperationBinding {
	readonly model?: object
	readonly schema?: SchemaDefinition
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
