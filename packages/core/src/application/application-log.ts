import { formatPluginIdentity, type PluginIdentity } from '../plugins/manifest.js'

/**
 * Receives UltimaBase log lines (ADR-0313). The console is compatible and is
 * the default. Lines never contain option values, secrets, credentials or row
 * values.
 *
 * @example `new App({ schemas, logger: pino() })`
 */
export interface Logger {
	debug(message: string, details?: object): void
	info(message: string, details?: object): void
	warn(message: string, details?: object): void
	error(message: string, details?: object): void
}

/**
 * Lowest level written to the logger: `'info'` by default, `'debug'` adds the
 * plugin privilege report and derived plugin defaults.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const logLevels: readonly LogLevel[] = ['debug', 'info', 'warn', 'error']
const logLevelNames: ReadonlySet<unknown> = new Set(logLevels)
const isLogLevel = (value: unknown): value is LogLevel =>
	logLevelNames.has(value)

/** @internal Validates and snapshots `logger` and `logLevel` application options. */
export class ApplicationLog {
	readonly #target: object | undefined
	readonly #threshold: number
	readonly #plugins = new Map<string, Logger>()

	constructor(logger: unknown, level: unknown) {
		if (level !== undefined && !isLogLevel(level)) {
			throw new TypeError(
				"logLevel must be 'debug', 'info', 'warn' or 'error'",
			)
		}
		this.#threshold = logLevels.indexOf(level ?? 'info')
		if (logger === false) {
			this.#target = undefined
			return
		}
		const target: unknown = logger ?? console
		if (typeof target !== 'object' || target === null) {
			throw new TypeError(
				'logger must be false or an object with debug, info, warn and error methods',
			)
		}
		for (const name of logLevels) {
			if (typeof Reflect.get(target, name) !== 'function') {
				throw new TypeError(`logger.${name} must be a function`)
			}
		}
		// Methods are read on each line, so spies installed later still apply.
		this.#target = target
	}

	/** Reports whether a line at this level reaches the logger. */
	enabled(level: LogLevel): boolean {
		return (
			this.#target !== undefined && logLevels.indexOf(level) >= this.#threshold
		)
	}

	debug(message: string, details?: object): void {
		this.#write('debug', message, details)
	}

	info(message: string, details?: object): void {
		this.#write('info', message, details)
	}

	warn(message: string, details?: object): void {
		this.#write('warn', message, details)
	}

	error(message: string, details?: object): void {
		this.#write('error', message, details)
	}

	/** Returns the logger given to one plugin: every line starts with its package name. */
	forPlugin(identity: PluginIdentity): Logger {
		const prefix = `[${formatPluginIdentity(identity)}] `
		let logger = this.#plugins.get(prefix)
		if (logger === undefined) {
			logger = Object.freeze({
				debug: (message: string, details?: object) => {
					this.#write('debug', prefix + message, details)
				},
				info: (message: string, details?: object) => {
					this.#write('info', prefix + message, details)
				},
				warn: (message: string, details?: object) => {
					this.#write('warn', prefix + message, details)
				},
				error: (message: string, details?: object) => {
					this.#write('error', prefix + message, details)
				},
			})
			this.#plugins.set(prefix, logger)
		}
		return logger
	}

	#write(level: LogLevel, message: string, details: object | undefined): void {
		const target = this.#target
		if (target === undefined || !this.enabled(level)) return
		try {
			const method: unknown = Reflect.get(target, level)
			if (typeof method !== 'function') return
			const result: unknown = Reflect.apply(
				method,
				target,
				details === undefined ? [message] : [message, details],
			)
			// Diagnostics never replace the result they describe.
			if (result instanceof Promise) void result.catch(() => undefined)
		} catch {
			// A failing logger never fails the operation it reports on.
		}
	}
}
