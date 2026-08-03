import { randomUUID } from 'node:crypto'

import {
	FrameworkApplication,
	type FrameworkApplicationOptions,
	type PluginDefinition,
} from '../../foundation.js'
import { registerQueryExecutionOwner } from '../../query/operations/execution.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { isPlainRecord } from '@ultimabase/shared'

import { requestSources } from '../context/request-context.js'
import type { FrameworkEngine } from '../engine/framework-engine.js'
import {
	createFrameworkEngine,
	normalizeCreateFrameworkEngineOptions,
	type CreateFrameworkEngineOptions,
} from './create-framework-engine.js'

const ultimaBaseOptionKeys = new Set([
	'masterAuthority',
	'plugins',
	'schemas',
	'validation',
])

/** Configures one complete framework facade without starting infrastructure. */
export interface UltimaBaseOptions<
	TSchemas extends readonly SchemaDefinition[],
	TPlugins extends readonly PluginDefinition[],
>
	extends
		FrameworkApplicationOptions<TSchemas, TPlugins>,
		CreateFrameworkEngineOptions {
	/**
	 * Registers the exact immutable schemas owned by this UltimaBase instance.
	 *
	 * @example `schemas: [UserSchema, PostSchema]`
	 */
	readonly schemas: TSchemas
	/**
	 * Declares top-level plugins; nested plugins join the same global graph.
	 *
	 * @example `plugins: [postgresPlugin(), graphqlYogaPlugin()]`
	 */
	readonly plugins: TPlugins
	/**
	 * Supplies the optional audited authority used for explicit master access.
	 *
	 * @example `masterAuthority: new MasterAuthority({ keys, onUse })`
	 */
	readonly masterAuthority?: NonNullable<
		CreateFrameworkEngineOptions['masterAuthority']
	>
	/**
	 * Configures structural validation, application time, and UUID generation.
	 *
	 * @example `validation: { timezone: "Europe/Paris" }`
	 */
	readonly validation?: NonNullable<CreateFrameworkEngineOptions['validation']>
}

const assertUltimaBaseOptions: (
	options: unknown,
) => asserts options is UltimaBaseOptions<
	readonly SchemaDefinition[],
	readonly PluginDefinition[]
> = (options) => {
	if (!isPlainRecord(options)) {
		throw new TypeError('UltimaBase options must be a plain object')
	}

	for (const key of Object.keys(options)) {
		if (!ultimaBaseOptionKeys.has(key)) {
			throw new TypeError(`UltimaBase contains unknown option: ${key}`)
		}
	}
}

const readEngineOptions = (
	options: UltimaBaseOptions<
		readonly SchemaDefinition[],
		readonly PluginDefinition[]
	>,
): Readonly<CreateFrameworkEngineOptions> =>
	normalizeCreateFrameworkEngineOptions({
		...(options.masterAuthority === undefined
			? {}
			: { masterAuthority: options.masterAuthority }),
		...(options.validation === undefined
			? {}
			: { validation: options.validation }),
	})

/**
 * Owns one isolated UltimaBase application and its Runtime engine.
 *
 * Construction validates and snapshots static configuration without opening
 * connections. Call `start()` before using direct queries.
 *
 * @example
 * ```ts
 * const ultimabase = new UltimaBase({
 *   schemas: [PostSchema],
 *   plugins: [postgresPlugin({ url: env.DATABASE_URL })],
 * })
 *
 * await ultimabase.start()
 * const posts = await PostSchema.query().find({ ultimabase })
 * ```
 */
export class UltimaBase<
	const TSchemas extends readonly SchemaDefinition[],
	const TPlugins extends readonly PluginDefinition[],
> {
	/** Exposes the Core composition boundary for advanced plugin and service access. */
	readonly application: FrameworkApplication<TSchemas, TPlugins>
	readonly #engineOptions: Readonly<CreateFrameworkEngineOptions>
	#frameworkEngine: FrameworkEngine<TSchemas, TPlugins> | undefined
	#startPromise: Promise<void> | undefined

	constructor(options: UltimaBaseOptions<TSchemas, TPlugins>) {
		const untrustedOptions: unknown = options

		assertUltimaBaseOptions(untrustedOptions)

		this.application = new FrameworkApplication({
			schemas: options.schemas,
			plugins: options.plugins,
		})
		this.#engineOptions = readEngineOptions(options)
		registerQueryExecutionOwner(this, {
			application: this.application,
			createRootExecutor: () => {
				const frameworkEngine = this.#frameworkEngine ?? this.engine
				const requestEngine = frameworkEngine.anonymous({
					requestId: randomUUID(),
					source: requestSources.internal,
				})

				// The facade-owned anonymous engine validates exact schema ownership.
				return requestEngine
			},
		})

		// Public facade identity is stable while private lifecycle state may advance.
		Object.freeze(this)
	}

	/** Reports the exact lifecycle state owned by the underlying application. */
	get state(): FrameworkApplication<TSchemas, TPlugins>['state'] {
		return this.application.state
	}

	/** Exposes the started Runtime engine for transports and advanced request binding. */
	get engine(): FrameworkEngine<TSchemas, TPlugins> {
		if (
			this.#frameworkEngine === undefined ||
			this.application.state !== 'started'
		) {
			throw new TypeError(
				'UltimaBase must be started before accessing its engine',
			)
		}

		return this.#frameworkEngine
	}

	/** Initializes plugins, assembles Runtime, and starts infrastructure exactly once. */
	start(): Promise<void> {
		if (
			this.application.state === 'stopping' ||
			this.application.state === 'stopped' ||
			this.application.state === 'disposing' ||
			this.application.state === 'disposed'
		) {
			throw new TypeError(
				`Cannot start UltimaBase while application is ${this.application.state}`,
			)
		}

		this.#startPromise ??= this.#performStart()

		return this.#startPromise
	}

	/** Stops active infrastructure without releasing setup-owned resources. */
	stop(): Promise<void> {
		return this.application.stop()
	}

	/** Permanently releases every plugin and service owned by this instance. */
	dispose(): Promise<void> {
		return this.application.dispose()
	}

	/** Integrates the facade with explicit resource-management scopes. */
	async [Symbol.asyncDispose](): Promise<void> {
		await this.dispose()
	}

	async #performStart(): Promise<void> {
		try {
			await this.application.initialize()
			const frameworkEngine = createFrameworkEngine(
				this.application,
				this.#engineOptions,
			)

			await this.application.start()
			this.#frameworkEngine = frameworkEngine
		} catch (error: unknown) {
			try {
				await this.application.dispose()
			} catch (cleanupError: unknown) {
				throw new AggregateError(
					[error, cleanupError],
					'UltimaBase startup failed and cleanup reported an additional error.',
					{ cause: cleanupError },
				)
			}

			throw error
		}
	}
}
