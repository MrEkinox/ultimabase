import { ApplicationCapabilityHost } from './capability-host.js'
import { runWithApplicationPluginOwner } from './callback-execution.js'
import { createPluginApplication, type PluginDefinition } from './definition.js'
import type { PluginGraph } from './graph.js'
import { formatPluginIdentity, type PluginIdentity } from './manifest.js'
import type {
	PluginApplicationLifecyclePhase,
	PluginApplicationResource,
} from './plugin-contributions.js'
import type { PluginSetupRegistries } from './setup-registries.js'

const startupPhases = [
	'connect',
	'prepareSchema',
	'startRuntime',
	'startTransports',
] as const satisfies readonly PluginApplicationLifecyclePhase[]

/** Describes the externally observable state of one application lifecycle. */
export type PluginLifecycleState =
	| 'idle'
	| 'setting-up'
	| 'ready'
	| 'starting'
	| 'started'
	| 'stopping'
	| 'stopped'
	| 'disposing'
	| 'disposed'

interface InitializedPlugin {
	readonly definition: PluginDefinition
	readonly resource: PluginApplicationResource<unknown> | undefined
}

const collectFailure = async (
	operation: () => PromiseLike<void> | void,
	errors: unknown[],
): Promise<void> => {
	try {
		await operation()
	} catch (error: unknown) {
		errors.push(error)
	}
}

const throwCleanupErrors = (
	errors: readonly unknown[],
	message: string,
): void => {
	if (errors.length === 1) throw errors[0]
	if (errors.length > 1) throw new AggregateError(errors, message)
}

const throwLifecycleFailure = (
	error: unknown,
	cleanupErrors: readonly unknown[],
): never => {
	if (cleanupErrors.length === 0) {
		throw error
	}

	throw new AggregateError(
		[error, ...cleanupErrors],
		'Plugin lifecycle failed and cleanup reported additional errors.',
		{ cause: error },
	)
}

/** Runs one resolved plugin graph and owns its application-scoped cleanup. */
export class PluginLifecycleManager {
	readonly #application: object
	readonly #graph: PluginGraph
	readonly #registries: PluginSetupRegistries
	readonly #capabilities: ApplicationCapabilityHost
	readonly #initializedPlugins: InitializedPlugin[] = []
	readonly #exportsByDefinition = new Map<PluginDefinition, unknown>()
	readonly #activePlugins = new Set<PluginDefinition>()
	#setupPromise: Promise<void> | undefined
	#startPromise: Promise<void> | undefined
	#stopPromise: Promise<void> | undefined
	#disposePromise: Promise<void> | undefined
	#state: PluginLifecycleState = 'idle'
	readonly #cleanupErrors: unknown[] = []

	constructor(
		graph: PluginGraph,
		registries: PluginSetupRegistries,
		capabilities?: ApplicationCapabilityHost,
		application?: object,
	) {
		this.#application = application ?? this
		this.#graph = graph
		this.#registries = registries
		this.#capabilities =
			capabilities ??
			new ApplicationCapabilityHost(
				graph,
				registries.schemas,
				registries.getConstraintCompilerReader(),
				this.#application,
			)
	}

	get state(): PluginLifecycleState {
		return this.#state
	}

	/** Internal proof required before Core can release lifecycle ownership. */
	get cleanupComplete(): boolean {
		return this.#state === 'disposed' && this.#cleanupErrors.length === 0
	}

	/** Runs setup once so callers may validate declarations before connections start. */
	setup(): Promise<void> {
		this.#assertNotDisposed('setup')
		this.#setupPromise ??= this.#performSetup()

		return this.#setupPromise
	}

	/** Runs every forward infrastructure phase once in graph order. */
	start(): Promise<void> {
		this.#assertNotDisposed('start')

		if (this.#state === 'stopping' || this.#state === 'stopped') {
			throw new TypeError('Cannot start a stopped plugin lifecycle')
		}

		this.#startPromise ??= this.#performStart()

		return this.#startPromise
	}

	/** Stops active plugins once in reverse dependency order. */
	stop(): Promise<void> {
		if (this.#state === 'disposed' || this.#state === 'disposing') {
			return this.#disposePromise ?? Promise.resolve()
		}

		if (this.#startPromise === undefined) {
			return Promise.resolve()
		}

		this.#stopPromise ??= this.#performStop()

		return this.#stopPromise
	}

	/** Stops infrastructure and releases plugins and services exactly once. */
	dispose(): Promise<void> {
		if (this.#disposePromise !== undefined) return this.#disposePromise
		if (this.#state === 'disposed') {
			return Promise.resolve().then(() => {
				throwCleanupErrors(
					this.#cleanupErrors,
					'Application cleanup remains unproven.',
				)
			})
		}

		this.#disposePromise = this.#performDispose()

		return this.#disposePromise
	}

	/** Returns setup output without weakening the unknown runtime boundary. */
	getPluginExports(
		identity: PluginDefinition | PluginIdentity | string,
	): unknown {
		if (
			typeof identity === 'string' &&
			this.#graph.plugins.filter(
				({ definition }) => definition.manifest.identity.pluginId === identity,
			).length > 1
		) {
			throw new TypeError(
				`Plugin ID is ambiguous; provide pluginId and instanceId: ${identity}`,
			)
		}

		const plugin =
			typeof identity === 'object' && 'manifest' in identity
				? identity
				: this.#graph.get(identity)?.definition
		const label =
			typeof identity === 'string'
				? identity
				: formatPluginIdentity(
						'manifest' in identity ? identity.manifest.identity : identity,
					)

		if (plugin === undefined || !this.#exportsByDefinition.has(plugin)) {
			throw new TypeError(`Plugin setup has not completed: ${label}`)
		}

		return this.#exportsByDefinition.get(plugin)
	}

	async #performSetup(): Promise<void> {
		this.#state = 'setting-up'

		try {
			await this.#capabilities.materialize()
			for (const { definition } of this.#graph) {
				const setupContext = this.#registries.forPlugin(
					definition.manifest.identity,
				)
				const resource = await this.#runAs(definition, () =>
					createPluginApplication(definition, setupContext),
				)

				this.#exportsByDefinition.set(definition, resource?.exports)
				this.#initializedPlugins.push({ definition, resource })
			}

			// Setup-only typed registries close before any infrastructure hook can run.
			this.#registries.closeSetup()
			this.#state = 'ready'
		} catch (error: unknown) {
			// Missing requirements must not replace the plugin error that prevented setup.
			this.#registries.closeSetup()
			const cleanupErrors = await this.#releaseResources()

			throwLifecycleFailure(error, cleanupErrors)
		}
	}

	async #performStart(): Promise<void> {
		try {
			await this.setup()
			this.#state = 'starting'

			for (const phase of startupPhases) {
				for (const { definition, resource } of this.#initializedPlugins) {
					await this.#runAs(definition, () => resource?.[phase]?.())
					this.#activePlugins.add(definition)
				}
			}

			this.#state = 'started'
		} catch (error: unknown) {
			if (this.#state === 'disposed') {
				throw error
			}

			const cleanupErrors = await this.#releaseResources()

			throwLifecycleFailure(error, cleanupErrors)
		}
	}

	async #performStop(): Promise<void> {
		try {
			await this.#startPromise
		} catch {
			// A failed start performs its own complete cleanup before rejecting.
			return
		}

		this.#state = 'stopping'
		const errors = await this.#stopActivePlugins()

		this.#state = 'stopped'
		throwCleanupErrors(errors, 'Multiple plugin stop hooks failed.')
	}

	async #performDispose(): Promise<void> {
		this.#state = 'disposing'
		const errors: unknown[] = []
		const pendingInitialization = this.#startPromise ?? this.#setupPromise

		if (pendingInitialization !== undefined) {
			// Setup/start must settle before disposal snapshots completed plugins.
			await collectFailure(() => pendingInitialization, errors)
		}

		// Awaited setup/start may have completed the same cleanup concurrently.
		if (this.state !== 'disposed') {
			await this.#releaseResources(this.#stopPromise, errors)
		}

		throwCleanupErrors(errors, 'Multiple plugin disposal operations failed.')
	}

	async #releaseResources(
		pendingStop?: Promise<void>,
		errors: unknown[] = [],
	): Promise<unknown[]> {
		if (pendingStop === undefined) {
			errors.push(...(await this.#stopActivePlugins()))
		} else {
			await collectFailure(() => pendingStop, errors)
		}

		errors.push(...(await this.#disposeInitializedPlugins()))
		await collectFailure(() => this.#disposeCapabilities(), errors)
		this.#state = 'disposed'

		return errors
	}

	async #stopActivePlugins(): Promise<unknown[]> {
		const errors: unknown[] = []

		for (const {
			definition,
			resource,
		} of this.#initializedPlugins.toReversed()) {
			if (!this.#activePlugins.has(definition)) continue
			await collectFailure(
				() => this.#runAs(definition, () => resource?.stop?.()),
				errors,
			)
		}

		this.#activePlugins.clear()
		this.#cleanupErrors.push(...errors)

		return errors
	}

	async #disposeInitializedPlugins(): Promise<unknown[]> {
		const errors: unknown[] = []

		for (const {
			definition,
			resource,
		} of this.#initializedPlugins.toReversed()) {
			await collectFailure(
				() => this.#runAs(definition, () => resource?.dispose?.()),
				errors,
			)
			await collectFailure(
				() => this.#capabilities.disposeOwner(definition.manifest.identity),
				errors,
			)
		}

		this.#initializedPlugins.length = 0
		this.#exportsByDefinition.clear()
		this.#cleanupErrors.push(...errors)

		return errors
	}

	#runAs<TResult>(plugin: PluginDefinition, callback: () => TResult): TResult {
		return runWithApplicationPluginOwner(
			this.#application,
			plugin.manifest.identity,
			callback,
		)
	}

	async #disposeCapabilities(): Promise<void> {
		try {
			await this.#capabilities.dispose()
		} catch (error: unknown) {
			this.#cleanupErrors.push(error)
			throw error
		}
	}

	#assertNotDisposed(operation: string): void {
		if (this.#state === 'disposed' || this.#state === 'disposing') {
			throw new TypeError(`Cannot ${operation} a disposed plugin lifecycle`)
		}
	}
}
