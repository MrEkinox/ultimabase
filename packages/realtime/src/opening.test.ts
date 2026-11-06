// What a storm of connections meets: a few open at once (D-277), and a failure
// of the server is told apart from a caller who changed (D-278).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { Caller, Logger, PluginTypes } from 'ultimabase'
import {
	PublicError,
	allow,
	defineApp,
	defineFunction,
	defineModel,
	definePlugin,
	master,
	memory,
} from 'ultimabase'
import { asUser } from '@ultimabase/testing'
import type { LiveMessage, Realtime, RealtimeApi, Viewer } from './index.ts'
import { realtime, realtimePlugin } from './index.ts'

const M = { as: master }

const Task = defineModel({
	name: 'Task',
	fields: (f) => ({ title: f.string() }),
	use: [realtime()],
}).with({ access: { read: () => true } })

let runs = 0
const titles = defineFunction({
	name: 'titles',
	query: true,
	use: [realtime()],
	output: z.number(),
	run: async () => {
		runs += 1
		return runs
	},
}).with({ access: allow.public })

const errors: unknown[] = []
const logger: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: (first: string | object, message?: string) => {
		errors.push(message ?? first)
	},
	child: () => logger,
}

let held: Promise<void> | undefined
let reading = 0
let most = 0
/** What `identify` does with the request it reads now, if anything. */
let identifying: ((id: string) => string) | undefined

interface Watching extends PluginTypes {
	readonly name: 'watching'
	readonly requires: Realtime
}
let api: RealtimeApi | undefined
const watching = definePlugin<Watching>({
	name: 'watching',
	manifest: {
		name: 'watching',
		version: '1.0.0',
		peerDependencies: { ultimabase: '*' },
	},
	requires: { realtime: realtimePlugin },
	api: ({ plugins }) => {
		api = plugins.realtime
	},
	identify: async (request) => {
		reading += 1
		most = Math.max(most, reading)
		await held
		reading -= 1
		const id = request.headers.get('authorization') ?? ''
		return asUser({ id: identifying?.(id) ?? id })
	},
})

const connect = async (id = 'ada'): Promise<Viewer> => {
	if (api === undefined) throw new Error('No realtime API.')
	return api.connect(
		new Request('http://localhost/', { headers: { authorization: id } }),
	)
}

/** Holds the callers being read until the returned function runs. */
const holding = () => {
	const { promise, resolve } = Promise.withResolvers<void>()
	held = promise
	return () => {
		held = undefined
		resolve()
	}
}

/** Takes every turn: what follows waits for one. */
const allTaken = () => {
	const release = holding()
	const taken = Array.from({ length: 8 }, async () => connect('other'))
	return async () => {
		release()
		await Promise.all(taken)
	}
}

const follow = async (viewer: Viewer, seen: LiveMessage[] = []) =>
	viewer.list('Task', { orderBy: { title: 'asc' }, first: 10 }, (message) =>
		seen.push(message),
	)

let app: ReturnType<typeof defineApp> | undefined

beforeEach(async () => {
	runs = 0
	reading = 0
	most = 0
	held = undefined
	identifying = undefined
	errors.length = 0
	app = defineApp({
		database: memory(),
		models: [Task],
		functions: [titles],
		plugins: [realtimePlugin({ refresh: 3600 }), watching.plugin()],
		logger,
	})
	await app.start()
})

afterEach(async () => {
	await app?.stop()
	vi.restoreAllMocks()
})

describe('a storm of connections', () => {
	it('reads at most eight callers at once (D-277)', async () => {
		const release = holding()
		const opening = Array.from({ length: 20 }, async () => connect())
		await vi.waitFor(() => expect(reading).toBe(8))
		await new Promise((done) => setTimeout(done, 20))
		expect(most).toBe(8)
		release()
		const viewers = await Promise.all(opening)
		expect(viewers).toHaveLength(20)
		expect(most).toBe(8)
	})

	it('reads nothing for a list whose connection closed while it waited', async () => {
		const viewer = await connect()
		const finished = allTaken()
		const waiting = follow(viewer)
		viewer.close()
		await finished()
		await expect(waiting).rejects.toThrow('The viewer is closed.')
	})

	it('runs no function whose connection closed while it waited', async () => {
		const viewer = await connect()
		const finished = allTaken()
		const waiting = viewer.value(
			'titles',
			async (caller: Caller) => titles.run({ as: caller }),
			() => undefined,
		)
		viewer.close()
		await finished()
		await waiting
		expect(runs).toBe(0)
	})
})

describe('how a viewer ended (D-278)', () => {
	it('did not fail when its caller became another user', async () => {
		const viewer = await connect()
		identifying = () => 'bob'
		expect(await viewer.identify()).toBeUndefined()
		expect(viewer.closed).toBe(true)
		expect(viewer.failed).toBe(false)
	})

	it('did not fail when identify refuses publicly', async () => {
		const viewer = await connect()
		identifying = () => {
			throw new PublicError('ACCESS_DENIED', 'Refused.')
		}
		expect(await viewer.identify()).toBeUndefined()
		expect(viewer.closed).toBe(true)
		expect(viewer.failed).toBe(false)
		expect(errors).toEqual([])
	})

	it('failed when identify fails any other way, and says so', async () => {
		const viewer = await connect()
		identifying = () => {
			throw new Error('The database is away.')
		}
		expect(await viewer.identify()).toBeUndefined()
		expect(viewer.closed).toBe(true)
		expect(viewer.failed).toBe(true)
		expect(errors).toEqual(['A live caller was not read.'])
	})

	it('failed when a write it follows could not be told', async () => {
		const viewer = await connect()
		await follow(viewer)
		vi.spyOn(viewer, 'flush').mockRejectedValue(new Error('Broken.'))
		await Task.create({ data: { title: 'one' } }, M)
		await vi.waitFor(() => expect(viewer.closed).toBe(true))
		expect(viewer.failed).toBe(true)
		expect(errors).toEqual(['A live viewer failed.'])
	})

	it('keeps following when identify reads the same caller', async () => {
		const viewer = await connect()
		expect(await viewer.identify()).toBeDefined()
		expect(viewer.closed).toBe(false)
		expect(viewer.failed).toBe(false)
	})
})
