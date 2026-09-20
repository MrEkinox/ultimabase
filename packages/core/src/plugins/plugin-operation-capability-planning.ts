import type { CapabilityToken } from './capabilities.js'
import type {
	MutableCapabilityEntry,
	OwnedProvider,
} from './capability-inventory.js'
import { formatPluginIdentity, type PluginPrivilege } from './manifest.js'
import {
	isAuthorizedOperationTransportBindingProvider,
	isAuthorizedPluginOperationProvider,
	operationTransportBindingCapability,
	pluginOperationHandlerCapability,
} from '../runtime/plugin-operations/capabilities.js'
import {
	isAuthorizedPluginSchemaMutationProvider,
	pluginSchemaMutationHandlerCapability,
} from '../runtime/schema-mutations/capabilities.js'
import {
	isAuthorizedSchemaMutationTransportBindingProvider,
	schemaMutationTransportBindingCapability,
} from '../runtime/schema-mutations/transport-capabilities.js'

interface PluginOperationProtocolPlanningOptions {
	readonly assertPrivilege: (
		provider: OwnedProvider,
		privilege: PluginPrivilege,
	) => void
	readonly reject: (
		message: string,
		details: Readonly<Record<string, unknown>>,
	) => never
}

/** Identifies operation protocols that reject generic consumption and mutation. */
export const isPluginOperationProtocolToken = (
	token: CapabilityToken,
): boolean =>
	token === pluginOperationHandlerCapability ||
	token === operationTransportBindingCapability ||
	token === pluginSchemaMutationHandlerCapability ||
	token === schemaMutationTransportBindingCapability

/** Enforces the exact public facade and privilege for every operation protocol. */
export const assertPluginOperationProtocolEntry = (
	entry: MutableCapabilityEntry,
	options: PluginOperationProtocolPlanningOptions,
): void => {
	if (!isPluginOperationProtocolToken(entry.token)) return
	if (entry.requirements.length > 0) {
		const [requirement] = entry.requirements
		options.reject(
			'Plugin operation protocols cannot be consumed through a capability requirement.',
			{
				kind: 'plugin-operation-requirement-forbidden',
				plugin:
					requirement === undefined
						? 'unknown'
						: formatPluginIdentity(requirement.owner),
				capabilityId: entry.token.capabilityId,
			},
		)
	}

	for (const provider of entry.providers) {
		const declaration = provider.declaration
		if (
			entry.token === pluginOperationHandlerCapability &&
			!isAuthorizedPluginOperationProvider(declaration)
		) {
			options.reject(
				'Plugin operation handlers must use provideOperationHandler.',
				{
					kind: 'plugin-operation-provider-factory',
					plugin: formatPluginIdentity(provider.owner),
					contributionId: declaration.contributionId,
				},
			)
		}
		if (
			entry.token === pluginSchemaMutationHandlerCapability &&
			!isAuthorizedPluginSchemaMutationProvider(declaration)
		) {
			options.reject(
				'Schema mutation handlers must use provideSchemaMutationHandler.',
				{
					kind: 'schema-mutation-provider-factory',
					plugin: formatPluginIdentity(provider.owner),
					contributionId: declaration.contributionId,
				},
			)
		}
		if (
			entry.token === schemaMutationTransportBindingCapability &&
			!isAuthorizedSchemaMutationTransportBindingProvider(declaration)
		) {
			options.reject(
				'Schema mutation transport bindings must use provideSchemaMutationTransportBinding.',
				{
					kind: 'schema-mutation-transport-provider-factory',
					plugin: formatPluginIdentity(provider.owner),
					contributionId: declaration.contributionId,
				},
			)
		}
		if (
			entry.token === operationTransportBindingCapability &&
			!isAuthorizedOperationTransportBindingProvider(declaration)
		) {
			options.reject(
				'Operation transport bindings must use provideOperationTransportBinding.',
				{
					kind: 'operation-transport-provider-factory',
					plugin: formatPluginIdentity(provider.owner),
					contributionId: declaration.contributionId,
				},
			)
		}

		if (entry.token === pluginSchemaMutationHandlerCapability) {
			options.assertPrivilege(provider, 'persistence:rewrite')
		}
		if (entry.token === operationTransportBindingCapability) {
			options.assertPrivilege(provider, 'transport:expose')
		}
		if (entry.token === schemaMutationTransportBindingCapability) {
			options.assertPrivilege(provider, 'transport:expose')
		}
	}
}
