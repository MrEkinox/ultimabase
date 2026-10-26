// `start` and `stop` (D-59, D-91): the plugins' `start` and `stop`, the
// loggers that name their source, the operations `stop` waits for, and
// `SIGTERM`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Adapter } from './adapter.ts'
import type { Logger, PluginTypes } from './index.ts'
import {
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
	transaction,
} from './index.ts'

const M = { as: master }
const manifest = {
	name: 'test-plugin',
	version: '1.0.0',
	peerDependencies: { ultimabase: '*' },
}
const log: string[] = []
const failing = new Set<string>()

type Entry = {
	readonly level: string
	readonly name?: unknown
	readonly first: unknown
	readonly message: string | undefined
}
const entries: Entry[] = []
function recorder(bindings: object = {}): Logger {
	const at =
		(level: string) =>
		(first: string | object, message?: string): void => {
			entries.push({ level, ...bindings, first, message })
		}
	return {
		info: at('info'),
		warn: at('warn'),
		error: at('error'),
		child: (more) => recorder({ ...bindings, ...more }),
	}
}

let gate: Promise<void> = Promise.resolve()
const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string() }),
}).with({
	hooks: {
		afterCreateCommit: async () => {
			await gate
			log.push('Note.afterCreateCommit')
		},
	},
})

interface Cache extends PluginTypes {
	readonly name: 'cache'
	readonly appOptions: { readonly size: number }
}
const cache = definePlugin<Cache>({
	name: 'cache',
	manifest,
	start: ({ options, logger }) => {
		log.push(`cache.start ${options.size}`)
		logger.info('Warm.')
		if (failing.has('cache.start')) throw new Error('cache.start failed.')
	},
	stop: () => {
		log.push('cache.stop')
		if (failing.has('cache.stop')) throw new Error('cache.stop failed.')
	},
})

interface Http extends PluginTypes {
	readonly name: 'http'
	readonly requires: Cache
}
const http = definePlugin<Http>({
	name: 'http',
	manifest,
	requires: { cache: cache.plugin },
	// Seeds at start; its stop still reads the database.
	start: async () => {
		await Note.create({ data: { text: 'seed' } }, M)
		log.push('http.start')
		if (failing.has('http.start')) throw new Error('http.start failed.')
	},
	stop: async () => {
		log.push(`http.stop ${await Note.count({}, M)}`)
		if (failing.has('http.stop')) throw new Error('http.stop failed.')
	},
})

const tracked = (): Adapter => {
	const database = memory()
	return {
		...database,
		stop: async () => {
			log.push('database.stop')
			await database.stop()
		},
	}
}
const started = () =>
	defineApp({
		database: tracked(),
		// Out of order: each plugin starts after those it needs.
		plugins: [http.plugin(), cache.plugin({ size: 2 })],
		models: [Note],
		logger: recorder(),
	})
const stopped = { message: 'Note is not a model of a started application.' }
const listeners = () => process.listenerCount('SIGTERM')

let open: () => void = () => undefined
/** Holds every `afterCreateCommit` until `open()`. */
const held = () => {
	gate = new Promise((done) => {
		open = done
	})
}
/** Sends `SIGTERM`, with `process.kill` stubbed. */
const killed = () => {
	const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
	process.emit('SIGTERM', 'SIGTERM')
	return kill
}

let app: ReturnType<typeof started>
let before: number
beforeEach(() => {
	log.length = 0
	entries.length = 0
	failing.clear()
	gate = Promise.resolve()
	before = listeners()
	app = started()
})
afterEach(async () => {
	failing.clear()
	await app.stop()
	vi.restoreAllMocks()
})

describe('plugins', () => {
	it('start after those they need and stop in reverse', async () => {
		await app.start()
		await app.stop()
		expect(log).toEqual([
			'cache.start 2',
			'Note.afterCreateCommit',
			'http.start',
			'http.stop 1',
			'cache.stop',
			'database.stop',
		])
	})

	it('log under their name, the kernel under ultimabase', async () => {
		await app.start()
		await app.stop()
		expect(entries).toEqual([
			{ level: 'info', name: 'cache', first: 'Warm.', message: undefined },
			{
				level: 'info',
				name: 'ultimabase',
				first: 'Application started.',
				message: undefined,
			},
			{
				level: 'info',
				name: 'ultimabase',
				first: 'Application stopped.',
				message: undefined,
			},
		])
	})

	it('stop those that started when one fails to start', async () => {
		failing.add('http.start')
		await expect(app.start()).rejects.toThrow('http.start failed.')
		expect(log.slice(-2)).toEqual(['cache.stop', 'database.stop'])
		await expect(Note.count({}, M)).rejects.toMatchObject(stopped)
		expect(listeners()).toBe(before)
		failing.clear()
		await app.start()
		expect(await Note.count({}, M)).toBe(1)
	})

	it('all stop when one fails to stop', async () => {
		await app.start()
		failing.add('http.stop')
		await expect(app.stop()).rejects.toThrow('http.stop failed.')
		expect(log.slice(-3)).toEqual([
			'http.stop 1',
			'cache.stop',
			'database.stop',
		])
		expect(entries).toContainEqual({
			level: 'error',
			name: 'http',
			first: { err: new Error('http.stop failed.') },
			message: 'The plugin failed to stop.',
		})
		await expect(Note.count({}, M)).rejects.toMatchObject(stopped)
	})

	it('refuse a start that is not a function', () => {
		const definition = { name: 'odd', manifest, start: 1 }
		expect(() => {
			Reflect.apply(definePlugin, undefined, [definition])
		}).toThrow(new TypeError('odd.start is a function.'))
	})
})

describe('start', () => {
	it('stops its database when another application is running', async () => {
		await app.start()
		const other = started()
		await expect(other.start()).rejects.toThrow('already running')
		expect(log.filter((line) => line === 'database.stop')).toHaveLength(1)
		expect(listeners()).toBe(before + 1)
	})

	it('refuses a second start while the first runs', async () => {
		const [first, second] = await Promise.allSettled([app.start(), app.start()])
		expect(first.status).toBe('fulfilled')
		expect(second).toMatchObject({
			status: 'rejected',
			reason: new Error('The application is running.'),
		})
		// The refused start left the database of the first one started.
		await expect(Note.count({}, M)).resolves.toBe(1)
	})
})

describe('stop', () => {
	it('waits for running operations and their commit hooks', async () => {
		await app.start()
		held()
		const writing = Note.create({ data: { text: 'late' } }, M)
		const stopping = app.stop()
		await new Promise((done) => setTimeout(done, 5))
		expect(log).not.toContain('database.stop')
		open()
		await Promise.all([writing, stopping])
		expect(log.slice(-2)).toEqual(['Note.afterCreateCommit', 'database.stop'])
	})

	it('waits for a running transaction', async () => {
		await app.start()
		held()
		const writing = transaction(async () =>
			Note.create({ data: { text: 'late' } }, M),
		)
		const stopping = app.stop()
		open()
		await Promise.all([writing, stopping])
		expect(log.slice(-2)).toEqual(['Note.afterCreateCommit', 'database.stop'])
	})

	it('runs once when called twice, and not before start', async () => {
		await app.stop()
		await app.start()
		await Promise.all([app.stop(), app.stop()])
		expect(log.filter((line) => line === 'database.stop')).toHaveLength(1)
		await expect(app.start()).resolves.toBeUndefined()
		await expect(app.start()).rejects.toThrow('The application is running.')
	})
})

describe('SIGTERM', () => {
	it('stops the application, then ends the process', async () => {
		await app.start()
		expect(listeners()).toBe(before + 1)
		const kill = killed()
		await vi.waitFor(() => {
			expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM')
		})
		expect(log.slice(-1)).toEqual(['database.stop'])
		expect(listeners()).toBe(before)
	})

	it('ends the process once its output is written', async () => {
		await app.start()
		// Writes to a pipe complete later on macOS: the last lines would be lost.
		const pending: (() => void)[] = []
		const streams = [process.stdout, process.stderr].map((stream) =>
			vi.spyOn(stream, 'write').mockImplementation((...args: unknown[]) => {
				const done = args.at(-1)
				if (typeof done === 'function') {
					pending.push(() => {
						Reflect.apply(done, undefined, [])
					})
				}
				return true
			}),
		)
		const kill = killed()
		await vi.waitFor(() => {
			expect(pending).toHaveLength(2)
		})
		expect(kill).not.toHaveBeenCalled()
		for (const stream of streams) stream.mockRestore()
		for (const write of pending) write()
		await vi.waitFor(() => {
			expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM')
		})
	})

	it('ends the process when the stop fails, and logs why', async () => {
		await app.start()
		failing.add('cache.stop')
		const kill = killed()
		await vi.waitFor(() => {
			expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM')
		})
		expect(entries).toContainEqual({
			level: 'error',
			name: 'ultimabase',
			first: { err: new Error('cache.stop failed.') },
			message: 'The application stopped with an error.',
		})
	})

	it('is no longer listened to once stopped', async () => {
		await app.start()
		await app.stop()
		expect(listeners()).toBe(before)
	})
})
