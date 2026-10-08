import type { PrivateStorageRegistry } from '../private-storage/registry.js'
import type {
	CapabilityConsumerValue,
	CapabilityToken,
} from '../plugins/capabilities.js'
import type {
	ApplicationCapabilityHost,
	MaterializedCapabilityContribution,
} from '../plugins/capability-host.js'
import type { CompiledCommandGraph } from '../plugins/command-graph.js'
import type { PluginDefinition } from '../plugins/definition.js'
import type { PluginIdentity, PluginPrivilege } from '../plugins/manifest.js'
import type { RuntimeCallbackExecutor } from '../runtime/contributions/execution.js'

interface ApplicationKernelStateOptions {
	readonly assertPrivilege: (
		owner: PluginIdentity,
		privilege: PluginPrivilege,
	) => void
	readonly capabilities: ApplicationCapabilityHost
	readonly pluginExports: (plugin: PluginDefinition) => unknown
	readonly privateStorage: PrivateStorageRegistry
}

/** Owns the closed set of private services attached to one application shell. */
export class ApplicationKernelState {
	readonly #options: ApplicationKernelStateOptions | undefined
	#commands: CompiledCommandGraph | undefined
	runtimeCallbacks: RuntimeCallbackExecutor | undefined

	constructor(options?: ApplicationKernelStateOptions) {
		this.#options = options
	}

	get bound(): boolean {
		return this.#options !== undefined
	}

	get commands(): CompiledCommandGraph {
		if (this.#commands === undefined) {
			throw new TypeError('Application commands have not been compiled')
		}
		return this.#commands
	}

	get privateStorage(): PrivateStorageRegistry {
		return this.#requireOptions().privateStorage
	}

	publishCommands(graph: CompiledCommandGraph): void {
		if (this.#commands !== undefined) {
			throw new TypeError('Application command graph is already bound')
		}
		this.#commands = graph
	}

	capability<const TToken extends CapabilityToken>(
		token: TToken,
	): CapabilityConsumerValue<TToken> | undefined {
		return this.#requireOptions().capabilities.read(token)
	}

	capabilityContributions<const TToken extends CapabilityToken>(
		token: TToken,
	): readonly MaterializedCapabilityContribution<TToken>[] {
		return this.#requireOptions().capabilities.readContributions(token)
	}

	assertPrivilege(owner: PluginIdentity, privilege: PluginPrivilege): void {
		this.#requireOptions().assertPrivilege(owner, privilege)
	}

	pluginExports(plugin: PluginDefinition): unknown {
		return this.#requireOptions().pluginExports(plugin)
	}

	#requireOptions(): ApplicationKernelStateOptions {
		if (this.#options === undefined) {
			throw new TypeError('Application kernel state is unavailable')
		}
		return this.#options
	}
}

const applicationStates = new WeakMap<object, ApplicationKernelState>()

/** Attaches the single private kernel state once during application construction. */
export const bindApplicationKernelState = (
	application: object,
	state: ApplicationKernelState,
): void => {
	const existing = applicationStates.get(application)
	if (existing?.bound === true) {
		throw new TypeError('Application kernel state is already bound')
	}
	state.runtimeCallbacks ??= existing?.runtimeCallbacks
	applicationStates.set(application, state)
}

/** Owns callback recursion state for framework-less internal Runtime harnesses. */
export const readApplicationRuntimeKernelState = (
	application: object,
): ApplicationKernelState => {
	const existing = applicationStates.get(application)
	if (existing !== undefined) return existing
	const state = new ApplicationKernelState()
	applicationStates.set(application, state)
	return state
}

/** Reads private application state without exposing it through plugin capabilities. */
export const readApplicationKernelState = (
	application: object,
): ApplicationKernelState => {
	const state = applicationStates.get(application)
	if (state === undefined) {
		throw new TypeError('Application kernel state is unavailable')
	}
	return state
}
