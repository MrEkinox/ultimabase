// `start` and `stop` (D-59, D-91): the database, the plugins' APIs, their
// `start` and `stop`, the operations still running, and `SIGTERM`.
import type { Adapter } from './adapter.ts'
import type { Logger } from './app-options.ts'
import { consoleLogger } from './console-logger.ts'
import type { Installed } from './plugin-app.ts'
import { buildApis, installed, withContexts } from './plugin-app.ts'
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

export function lifecycle(options: {
	readonly database: Adapter
	readonly plugins?: readonly unknown[]
	readonly models: readonly unknown[]
	readonly logger?: Logger
}): Lifecycle {
	const { database, models } = options
	let started: Started | undefined
	let stopping: Promise<void> | undefined

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
		if (started !== undefined) throw new Error('The application is running.')
		const { plugins: records, apiOrder } = installed(options.plugins ?? [])
		const resolved = resolve(
			models,
			records.map((plugin) => plugin.code),
		)
		const base = options.logger ?? consoleLogger()
		const logger = base.child({ name: 'ultimabase' })
		const plugins = withContexts(apiOrder, base)
		await database.start(resolved.schema)
		const apis = new Map<string, unknown>()
		const app: Running = {
			resolved,
			adapter: database,
			logger,
			apis,
			work: new Work(),
		}
		register(app)
		const ran: Installed[] = []
		try {
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
