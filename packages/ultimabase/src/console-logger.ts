// The logger the kernel writes to when the application gives none (D-58,
// D-88): one JSON line per entry, pino's fields.
import type { Logger } from './app-options.ts'

type Level = 'info' | 'warn' | 'error'

/** An error as pino's `err` serializer writes it. */
function serialized(value: unknown): unknown {
	if (!(value instanceof Error)) return value
	return { type: value.name, message: value.message, stack: value.stack }
}

function entry(
	level: Level,
	bindings: object,
	first: string | object,
	message: string | undefined,
): string {
	const fields = typeof first === 'string' ? {} : first
	const msg = typeof first === 'string' ? first : message
	return JSON.stringify({
		level,
		time: Date.now(),
		...bindings,
		...Object.fromEntries(
			Object.entries(fields).map(([key, value]) => [key, serialized(value)]),
		),
		...(msg === undefined ? {} : { msg }),
	})
}

export function consoleLogger(bindings: object = {}): Logger {
	const log =
		(level: Level) =>
		(first: string | object, message?: string): void => {
			console[level](entry(level, bindings, first, message))
		}
	return {
		info: log('info'),
		warn: log('warn'),
		error: log('error'),
		child: (more) => consoleLogger({ ...bindings, ...more }),
	}
}
