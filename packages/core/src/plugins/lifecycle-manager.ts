import { immutableRecord } from '@ultimabase/shared'

import type { NormalizedPlugin } from './normalization.js'
import {
	runPluginLifecycleHook,
	runPluginSetup,
	type PluginLifecycleContext,
	type PluginLifecyclePhase,
} from './definition.js'
import type { PluginGraph } from './graph.js'
import type { PluginSetupRegistries } from './setup-registries.js'

const startupPhases = [
	'connect',
	'prepareSchema',
	'startRuntime',
	'startTransports',
] as const satisfies readonly PluginLifecyclePhase[]

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
	readonly plugin: NormalizedPlugin
	readonly context: PluginLifecycleContext<unknown>
}

const reverse = <TValue>(values: readonly TValue[]): readonly TValue[] =>
	values.toReversed()

const collectFailure = async (
	operation: () => Promise<void>,
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
	if (errors.length === 0) {
		return
	}

	if (errors.length === 1) {
		throw errors[0]
	}

	throw new AggregateError(errors, message)
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
	readonly #graph: PluginGraph
	readonly #registries: PluginSetupRegistries
	readonly #initializedPlugins: InitializedPlugin[] = []
	readonly #exportsByName = new Map<string, unknown>()
	readonly #activePluginNames = new Set<string>()
	#setupPromise: Promise<void> | undefined
	#startPromise: Promise<void> | undefined
	#stopPromise: Promise<void> | undefined
	#disposePromise: Promise<void> | undefined
	#state: PluginLifecycleState = 'idle'

	constructor(graph: PluginGraph, registries: PluginSetupRegistries) {
		this.#graph = graph
		this.#registries = registries
	}

	get state(): PluginLifecycleState {
		return this.#state
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
		if (this.#state === 'disposed') {
			return Promise.resolve()
		}

		this.#disposePromise ??= this.#performDispose()

		return this.#disposePromise
	}

	/** Returns setup output without weakening the unknown runtime boundary. */
	getPluginExports(pluginName: string): unknown {
		if (!this.#exportsByName.has(pluginName)) {
			throw new TypeError(`Plugin setup has not completed: ${pluginName}`)
		}

		return this.#exportsByName.get(pluginName)
	}

	async #performSetup(): Promise<void> {
		this.#state = 'setting-up'

		try {
			for (const plugin of this.#graph) {
				const pluginName = plugin.definition.name
				const setupContext = this.#registries.forPlugin(pluginName)
				const pluginExports = await runPluginSetup(
					plugin.definition,
					setupContext,
				)
				const context = immutableRecord({
					...setupContext,
					pluginExports,
				})

				this.#exportsByName.set(pluginName, pluginExports)
				this.#initializedPlugins.push({ plugin, context })
			}

			this.#state = 'ready'
		} catch (error: unknown) {
			const cleanupErrors = await this.#cleanupAfterFailure()

			throwLifecycleFailure(error, cleanupErrors)
		}
	}

	async #performStart(): Promise<void> {
		try {
			await this.setup()
			this.#state = 'starting'

			for (const phase of startupPhases) {
				for (const initializedPlugin of this.#initializedPlugins) {
					await runPluginLifecycleHook(
						initializedPlugin.plugin.definition,
						phase,
						initializedPlugin.context,
					)
					this.#activePluginNames.add(initializedPlugin.plugin.definition.name)
				}
			}

			this.#state = 'started'
		} catch (error: unknown) {
			if (this.#state === 'disposed') {
				throw error
			}

			const cleanupErrors = await this.#cleanupAfterFailure()

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

		if (this.#startPromise !== undefined) {
			await collectFailure(async (): Promise<void> => {
				await this.#startPromise
			}, errors)
		} else if (this.#setupPromise !== undefined) {
			// Standalone setup must settle before disposal snapshots completed plugins.
			await collectFailure(async (): Promise<void> => {
				await this.#setupPromise
			}, errors)
		}

		if (!this.#isDisposed()) {
			if (this.#stopPromise === undefined) {
				errors.push(...(await this.#stopActivePlugins()))
			} else {
				await collectFailure(async (): Promise<void> => {
					await this.#stopPromise
				}, errors)
			}

			errors.push(...(await this.#disposeInitializedPlugins()))
			await collectFailure(
				async (): Promise<void> => this.#registries.services.dispose(),
				errors,
			)
			this.#state = 'disposed'
		}

		throwCleanupErrors(errors, 'Multiple plugin disposal operations failed.')
	}

	async #cleanupAfterFailure(): Promise<readonly unknown[]> {
		const errors = await this.#stopActivePlugins()

		errors.push(...(await this.#disposeInitializedPlugins()))
		await collectFailure(
			async (): Promise<void> => this.#registries.services.dispose(),
			errors,
		)
		this.#state = 'disposed'

		return errors
	}

	async #stopActivePlugins(): Promise<unknown[]> {
		const errors: unknown[] = []

		for (const initializedPlugin of reverse(this.#initializedPlugins)) {
			const pluginName = initializedPlugin.plugin.definition.name

			if (!this.#activePluginNames.has(pluginName)) {
				continue
			}

			await collectFailure(async (): Promise<void> => {
				await runPluginLifecycleHook(
					initializedPlugin.plugin.definition,
					'stop',
					initializedPlugin.context,
				)
			}, errors)
		}

		this.#activePluginNames.clear()

		return errors
	}

	async #disposeInitializedPlugins(): Promise<unknown[]> {
		const errors: unknown[] = []

		for (const initializedPlugin of reverse(this.#initializedPlugins)) {
			await collectFailure(async (): Promise<void> => {
				await runPluginLifecycleHook(
					initializedPlugin.plugin.definition,
					'dispose',
					initializedPlugin.context,
				)
			}, errors)
		}

		this.#initializedPlugins.length = 0
		this.#exportsByName.clear()

		return errors
	}

	#assertNotDisposed(operation: string): void {
		if (this.#state === 'disposed' || this.#state === 'disposing') {
			throw new TypeError(`Cannot ${operation} a disposed plugin lifecycle`)
		}
	}

	#isDisposed(): boolean {
		return this.#state === 'disposed'
	}
}
