import { immutableRecord, type MaybePromise } from '@ultimabase/shared'

import type { CompiledCommandGraph } from './command-graph.js'
import type { ApplicationCapabilityFactoryContext } from './capabilities.js'
import { runWithApplicationPluginOwner } from './callback-execution.js'
import { readPluginCommandPlan } from './definition.js'
import type { PluginGraph } from './graph.js'
import type { PluginIdentity } from './manifest.js'
import type { NormalizedPlugin } from './normalization.js'
import type { PluginSchemaContributionOwner } from '../schema/schema/provenance.js'
import type {
	CommandBindings,
	OwnedCommandHandlerPlan,
	OwnedCommandTransportPlan,
} from '../runtime/commands/bindings.js'

interface RetainedCommandResource {
	readonly dispose: () => MaybePromise<void>
	readonly owner: PluginIdentity
}

interface PluginCommandMaterializerOptions {
	readonly application: object
	readonly context: (
		plugin: NormalizedPlugin,
		owner: PluginIdentity,
	) => ApplicationCapabilityFactoryContext
	readonly graph: PluginGraph
	readonly retain: (resource: RetainedCommandResource) => void
}

const commandOwner = (
	plugin: NormalizedPlugin,
): PluginSchemaContributionOwner => {
	const identity = plugin.definition.manifest.identity
	return immutableRecord({
		kind: 'plugin' as const,
		pluginId: identity.pluginId,
		...(identity.instanceId === undefined
			? {}
			: { instanceId: identity.instanceId }),
		version: plugin.definition.manifest.version,
	})
}

/** Materializes native command facts around generic application capabilities. */
export class PluginCommandMaterializer {
	readonly #options: PluginCommandMaterializerOptions
	readonly #plans

	constructor(options: PluginCommandMaterializerOptions) {
		this.#options = options
		this.#plans = options.graph.plugins.map((plugin) => ({
			plan: readPluginCommandPlan(plugin.definition),
			plugin,
		}))
	}

	/** Binds inert transport facts before capability factories can plan them. */
	bindTransports(
		graph: CompiledCommandGraph | undefined,
	): CommandBindings | undefined {
		const hasCommands = this.#plans.some(
			({ plan }) => plan.handlers.length > 0 || plan.transports.length > 0,
		)
		if (hasCommands && graph === undefined) {
			throw new TypeError(
				'Plugin commands require a compiled application command graph',
			)
		}
		if (graph === undefined) return undefined

		const transports: OwnedCommandTransportPlan[] = []
		for (const { plan, plugin } of this.#plans) {
			const owner = commandOwner(plugin)
			for (const transport of plan.transports) {
				transports.push({ ...transport, owner })
			}
		}
		graph.bindings.bindTransports(transports)
		return graph.bindings
	}

	/** Creates owner-attributed handlers after their capability dependencies. */
	async bindHandlers(bindings: CommandBindings | undefined): Promise<void> {
		if (bindings === undefined) return
		const handlers: OwnedCommandHandlerPlan[] = []
		for (const { plan, plugin } of this.#plans) {
			const owner = commandOwner(plugin)
			for (const handler of plan.handlers) {
				const resource = await runWithApplicationPluginOwner(
					this.#options.application,
					owner,
					() => handler.create(this.#options.context(plugin, owner)),
				)
				handlers.push({
					contributionId: handler.contributionId,
					owner,
					resource,
					source: handler.source,
				})
				if (resource.dispose !== undefined) {
					const dispose = resource.dispose
					this.#options.retain({
						owner,
						dispose: () =>
							runWithApplicationPluginOwner(
								this.#options.application,
								owner,
								dispose,
							),
					})
				}
			}
		}
		bindings.bindHandlers(handlers)
	}
}
