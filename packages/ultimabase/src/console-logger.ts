// The logger the kernel writes to when the application gives none (D-58,
// D-88, D-93): a readable line in a terminal, one JSON line with pino's
// fields everywhere else.
import { styleText } from 'node:util'
import type { Logger } from './app-options.ts'

type Level = 'info' | 'warn' | 'error'

const colors = { info: 'green', warn: 'yellow', error: 'red' } as const

/** An error as pino's `err` serializer writes it. */
function serialized(value: unknown): unknown {
	if (!(value instanceof Error)) return value
	return { type: value.name, message: value.message, stack: value.stack }
}

function json(level: Level, fields: object, msg: string | undefined): string {
	return JSON.stringify({
		level,
		time: Date.now(),
		...Object.fromEntries(
			Object.entries(fields).map(([key, value]) => [key, serialized(value)]),
		),
		...(msg === undefined ? {} : { msg }),
	})
}

/** A value as `key=value` shows it: quoted when it would read ambiguously. */
function shown(value: unknown): string {
	if (typeof value === 'string' && /^[^\s"=]+$/u.test(value)) return value
	return JSON.stringify(value) ?? String(value)
}

/** `10:42:07 INFO  [cache] Warm. size=2`, then each error's stack, indented. */
function readable(
	level: Level,
	fields: object,
	msg: string | undefined,
	stream: NodeJS.WriteStream,
): string {
	const { name, ...rest }: { readonly name?: unknown } = fields
	const errors = Object.values(rest).filter((value) => value instanceof Error)
	const details = Object.entries(rest)
		.filter(([, value]) => !(value instanceof Error))
		.map(([key, value]) => `${key}=${shown(value)}`)
	const line = [
		styleText('dim', new Date().toTimeString().slice(0, 8), { stream }),
		styleText(colors[level], level.toUpperCase().padEnd(5), { stream }),
		name === undefined ? undefined : `[${shown(name)}]`,
		msg,
		...details,
	]
	const stacks = errors.map((error) =>
		(error.stack ?? `${error.name}: ${error.message}`).replaceAll(
			/^/gmu,
			'    ',
		),
	)
	return [line.filter((part) => part !== undefined).join(' '), ...stacks].join(
		'\n',
	)
}

export function consoleLogger(bindings: object = {}): Logger {
	const log =
		(level: Level) =>
		(first: string | object, message?: string): void => {
			const fields = {
				...bindings,
				...(typeof first === 'string' ? {} : first),
			}
			const msg = typeof first === 'string' ? first : message
			// console.info writes to stdout, console.warn and console.error to stderr.
			const stream = level === 'info' ? process.stdout : process.stderr
			console[level](
				stream.isTTY
					? readable(level, fields, msg, stream)
					: json(level, fields, msg),
			)
		}
	return {
		info: log('info'),
		warn: log('warn'),
		error: log('error'),
		child: (more) => consoleLogger({ ...bindings, ...more }),
	}
}
