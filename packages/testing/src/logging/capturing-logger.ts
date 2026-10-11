import type { LogLevel, Logger } from '@ultimabase/core'

/** One line received by a capturing logger. */
export interface CapturedLogLine {
	readonly level: LogLevel
	readonly message: string
	readonly details?: object
}

/** An application logger that records every line for assertions (ADR-0313). */
export interface CapturingLogger extends Logger {
	/** Lines in arrival order. */
	readonly lines: readonly CapturedLogLine[]
	/** Messages of the lines at one level, in arrival order. */
	messages(level?: LogLevel): readonly string[]
	/** Forgets every recorded line. */
	clear(): void
}

/**
 * Creates a logger for `new App({ logger })` that records lines instead of
 * printing them. Combine it with `logLevel: 'debug'` to capture everything.
 *
 * @example
 * ```ts
 * const logger = createCapturingLogger()
 * const app = new App({ schemas, logger })
 * await app.start()
 * expect(logger.messages('warn')).toEqual([])
 * ```
 */
export const createCapturingLogger = (): CapturingLogger => {
	const lines: CapturedLogLine[] = []
	const write =
		(level: LogLevel) =>
		(message: string, details?: object): void => {
			lines.push(
				Object.freeze(
					details === undefined
						? { level, message }
						: { details, level, message },
				),
			)
		}
	return Object.freeze({
		clear: () => {
			lines.length = 0
		},
		debug: write('debug'),
		error: write('error'),
		info: write('info'),
		lines,
		messages: (level?: LogLevel) =>
			lines
				.filter((line) => level === undefined || line.level === level)
				.map((line) => line.message),
		warn: write('warn'),
	})
}
