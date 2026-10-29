// `start` and `stop` (D-59, D-91): the database, the plugins' APIs, their
// `start` and `stop`, the operations still running, and `SIGTERM`.
import type { Adapter, Schema } from './adapter.ts'
import type { Logger, MasterKey } from './app-options.ts'
import type { PluginCaller } from './complete.ts'
import { completer } from './complete.ts'
import { consoleLogger } from './console-logger.ts'
import { feedOf } from './feed.ts'
import type { PluginIdentify } from './identify.ts'
import { identifier } from './identify.ts'
import { checkVersions } from './manifest.ts'
import { checked, synced } from './migrate.ts'
import type { Installed } from './plugin-app.ts'
import {
	buildApis,
	installed,
	pluginCallers,
	pluginIdentifiers,
	withContexts,
} from './plugin-app.ts'
import type { Running } from './running.ts'
import { register, unregister, Work } from './running.ts'
import { resolve } from './schema.ts'

export type Lifecycle = {
	readonly start: () => Promise<void>
	readonly stop: () => Promise<void>
}

type Started = {
	readonly app: Running
	readonly plugins: readonly Installed[]
	readonly onSigterm: () => void
}

/** Stops `plugins` in reverse order, each even when another fails. */
async function stopped(plugins: readonly Installed[]): Promise<unknown[]> {
	const errors: unknown[] = []
	for (const { code, context } of plugins.toReversed()) {
		if (code.stop === undefined) continue
		try {
			await Reflect.apply(code.stop, undefined, [context])
		} catch (error) {
			context.logger.error({ err: error }, 'The plugin failed to stop.')
			errors.push(error)
		}
	}
	return errors
}

export type LifecycleOptions = {
	readonly database: Adapter
	readonly plugins?: readonly unknown[]
	/** The application's `defineFunction` values (D-27). */
	readonly functions?: readonly unknown[]
	readonly models: readonly unknown[]
	readonly logger?: Logger
	readonly masterKey?: MasterKey
}

/** Once stdout and stderr have written what they were given. */
const written = () =>
	Promise.all(
		[process.stdout, process.stderr].map(
			(stream) => new Promise((done) => stream.write('', done)),
		),
	)

/** The application's schema, or a message on what is wrong with it. */
export function schemaOf(options: LifecycleOptions): Schema {
	const { plugins } = installed(options.plugins ?? [])
	return resolve(
		options.models,
		plugins.map((plugin) => plugin.code),
	).schema
}

/** The kernel's logger: the application's, or JSON lines. */
export const kernelLogger = (options: LifecycleOptions): Logger =>
	(options.logger ?? consoleLogger()).child({ name: 'ultimabase' })

/** Syncs a development database, or checks a production one (D-105). */
async function follow(
	database: Adapter,
	schema: Schema,
	logger: Logger,
): Promise<void> {
	try {
		await (process.env['NODE_ENV'] === 'production'
			? checked(database, schema, logger)
			: synced(database, schema, logger, false))
	} catch (error) {
		await database.stop()
		throw error
	}
}

export function lifecycle(options: LifecycleOptions): Lifecycle {
	const { database, models } = options
	let started: Started | undefined
	let stopping: Promise<void> | undefined
	let starting = false

	const shutDown = async ({ app, plugins, onSigterm }: Started) => {
		process.off('SIGTERM', onSigterm)
		const errors = await stopped(plugins)
		// A plugin's stop may still query; the database closes last.
		await app.work.settled()
		unregister(app)
		started = undefined
		await database.stop()
		app.logger.info('Application stopped.')
		if (errors.length > 0) throw errors[0]
	}

	const stop = async (): Promise<void> => {
		if (stopping !== undefined) return stopping
		if (started === undefined) return
		stopping = shutDown(started).finally(() => {
			stopping = undefined
		})
		return stopping
	}

	const start = async (): Promise<void> => {
		if (started !== undefined || starting) {
			throw new Error('The application is running.')
		}
		// Set before the first await: a second start meanwhile is refused.
		starting = true
		try {
			await launch()
		} finally {
			starting = false
		}
	}

	const launch = async (): Promise<void> => {
		const { plugins: records, apiOrder } = installed(options.plugins ?? [])
		const resolved = resolve(
			models,
			records.map((plugin) => plugin.code),
		)
		const base = options.logger ?? consoleLogger()
		const logger = base.child({ name: 'ultimabase' })
		checkVersions(records, logger)
		// Plugins identify with their contexts, which hold identify.
		const identifiers: PluginIdentify[] = []
		const callers: PluginCaller[] = []
		const complete = completer(callers)
		const identify = identifier(
			options.masterKey,
			logger,
			identifiers,
			complete,
		)
		const { plugins, functions } = withContexts(
			apiOrder,
			base,
			identify,
			resolved,
			options.functions ?? [],
		)
		identifiers.push(...pluginIdentifiers(records, plugins))
		callers.push(...pluginCallers(records, plugins))
		await database.start(resolved.schema, logger, feedOf(records, plugins))
		const apis = new Map<string, unknown>()
		const app: Running = {
			resolved,
			adapter: database,
			logger,
			apis,
			functions: functions.definitions,
			work: new Work(),
			complete,
		}
		const ran: Installed[] = []
		try {
			await follow(database, resolved.schema, logger)
			register(app)
			// An API may read the APIs it needs as it is built (D-89).
			buildApis(plugins, apis)
			for (const plugin of plugins) {
				const { code, context } = plugin
				if (code.start !== undefined) {
					await Reflect.apply(code.start, undefined, [context])
				}
				ran.push(plugin)
			}
		} catch (error) {
			await stopped(ran)
			unregister(app)
			await database.stop()
			throw error
		}
		const onSigterm = () => {
			void stop()
				.catch((error: unknown) => {
					logger.error({ err: error }, 'The application stopped with an error.')
				})
				// The last lines first: a pipe may write them later.
				.then(written)
				.finally(() => {
					// Its listener is gone: the signal now ends the process.
					process.kill(process.pid, 'SIGTERM')
				})
		}
		process.once('SIGTERM', onSigterm)
		started = { app, plugins, onSigterm }
		logger.info('Application started.')
	}

	return { start, stop }
}
