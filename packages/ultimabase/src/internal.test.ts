// `ultimabase/internal` (D-130): new runs of an application on another
// database, without info lines, the running plugins' APIs, and an adapter's
// own statements joining the open transaction (D-137), and the running
// database emptied (D-188).
import { afterEach, expect, it, vi } from 'vitest'
import type { Logger, PluginTypes } from './index.ts'
import {
	defineApp,
	defineModel,
	definePlugin,
	master,
	memory,
	transaction,
} from './index.ts'
import {
	completedCaller,
	emptyRunning,
	joining,
	quietRuns,
	runningApi,
} from './internal.ts'

const M = { as: master }
const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string() }),
})

const manifest = {
	name: 'taking',
	version: '1.0.0',
	peerDependencies: { ultimabase: '*' },
}
interface Echo extends PluginTypes {
	readonly name: 'echo'
	readonly api: { readonly say: () => string }
}
const echo = definePlugin<Echo>({
	name: 'echo',
	manifest: { ...manifest, name: 'echo' },
	api: () => ({ say: () => 'hi' }),
	start: ({ logger }) => {
		logger.info('Started.')
		logger.warn('Careful.')
		logger.error('Broken.')
	},
})

const lines: string[] = []
function recorder(name = ''): Logger {
	const at = (level: string) => (first: string | object, message?: string) => {
		lines.push(
			`${level} ${name} ${typeof first === 'string' ? first : message}`,
		)
	}
	return {
		info: at('info'),
		warn: at('warn'),
		error: at('error'),
		child: (bindings) => recorder(Object.values(bindings).join(',')),
	}
}

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
	await stop?.()
	stop = undefined
	lines.length = 0
	vi.restoreAllMocks()
})

it('runs the application on the database it is given', async () => {
	const declared = memory()
	const app = defineApp({ database: declared, models: [Note] })
	const runs = quietRuns(app)
	expect(runs?.declared).toBe(declared)
	const first = runs?.on(memory())
	await first?.start()
	await Note.create({ data: { text: 'one' } }, M)
	await first?.stop()
	const second = runs?.on(memory())
	await second?.start()
	stop = second?.stop
	expect(await Note.count({}, M)).toBe(0)
})

it('drops info lines and keeps warnings and errors', async () => {
	const app = defineApp({
		database: memory(),
		plugins: [echo.plugin()],
		models: [Note],
		logger: recorder(),
	})
	const run = quietRuns(app)?.on(memory())
	await run?.start()
	stop = run?.stop
	expect(lines).toEqual(['warn echo Careful.', 'error echo Broken.'])
	const api = runningApi('echo')
	expect(typeof api === 'object' && api !== null && 'say' in api).toBe(true)
})

it('quiets the console logger when the application has none', async () => {
	const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
	vi.spyOn(console, 'error').mockImplementation(() => undefined)
	const app = defineApp({
		database: memory(),
		plugins: [echo.plugin()],
		models: [Note],
	})
	const run = quietRuns(app)?.on(memory())
	await run?.start()
	stop = run?.stop
	expect(info).not.toHaveBeenCalled()
	expect(warn).toHaveBeenCalledOnce()
})

it('knows only what defineApp returned, and APIs only while running', () => {
	expect(quietRuns({ start: () => undefined })).toBeUndefined()
	expect(quietRuns(undefined)).toBeUndefined()
	expect(runningApi('echo')).toBeUndefined()
})

it('joins the open transaction on its adapter only (D-137)', async () => {
	const database = memory()
	const app = defineApp({ database, models: [Note] })
	await app.start()
	stop = async () => app.stop()
	expect(await joining(database, async (tx) => tx)).toBeUndefined()
	await transaction(async () => {
		expect(await joining(database, async (tx) => typeof tx)).toBe('object')
		expect(await joining(memory(), async (tx) => tx)).toBeUndefined()
	})
	const failed = transaction(async () => {
		await Note.create({ data: { text: 'one' } }, M)
		await joining(database, async () => {
			throw new Error('Refused.')
		}).catch(() => undefined)
	})
	await expect(failed).rejects.toThrow('Refused.')
	expect(await Note.count({}, M)).toBe(0)
	await app.stop()
	stop = undefined
	expect(await joining(database, async (tx) => tx)).toBeUndefined()
})

it('empties the running database, then has live reads read again (D-188)', async () => {
	await expect(emptyRunning()).rejects.toThrow('No application is running.')
	const calls: string[] = []
	const taking = definePlugin({
		name: 'taking',
		manifest,
		changed: () => calls.push('changed'),
		missed: () => calls.push('missed'),
	})
	const app = defineApp({
		database: memory(),
		models: [Note],
		plugins: [taking.plugin()],
	})
	await app.start()
	stop = async () => app.stop()
	await Note.create({ data: { text: 'one' } }, M)
	await emptyRunning()
	expect(await Note.count({}, M)).toBe(0)
	expect(calls.at(-1)).toBe('missed')
	await Note.create({ data: { text: 'one' } }, M)
	expect(await Note.count({}, M)).toBe(1)
})

/** An application whose database records when it empties, and its log. */
async function emptying(): Promise<string[]> {
	const database = memory()
	const calls: string[] = []
	const app = defineApp({
		database: {
			...database,
			empty: async () => {
				calls.push('empty')
				return database.empty()
			},
		},
		models: [Note],
	})
	await app.start()
	stop = async () => app.stop()
	return calls
}

it('empties once the running operations are over, new ones held (D-188)', async () => {
	const calls = await emptying()
	const { promise: saved, resolve: save } = Promise.withResolvers<void>()
	const { promise: wrote, resolve: write } = Promise.withResolvers<void>()
	// A request writes when the reset comes, and goes on writing.
	const running = transaction(async () => {
		await Note.create({ data: { text: 'one' } }, M)
		write()
		await saved
		await Note.create({ data: { text: 'two' } }, M)
		calls.push('saved')
	})
	await wrote
	const emptied = emptyRunning()
	const later = Note.create({ data: { text: 'three' } }, M).then(() =>
		calls.push('later'),
	)
	await new Promise((done) => setTimeout(done, 20))
	expect(calls).toEqual([])
	save()
	await Promise.all([running, emptied, later])
	expect(calls).toEqual(['saved', 'empty', 'later'])
	expect(await Note.findMany({ select: { text: true } }, M)).toEqual([
		{ text: 'three' },
	])
})

it('fails when operations still run after 5 s, emptying nothing (D-188)', async () => {
	const calls = await emptying()
	const { promise: saved, resolve: save } = Promise.withResolvers<void>()
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
	try {
		const running = transaction(async () => saved)
		const emptied = emptyRunning().catch((error: unknown) => error)
		await vi.advanceTimersByTimeAsync(5000)
		expect(await emptied).toMatchObject({
			message: '1 operations still ran after 5 s; nothing was emptied.',
		})
		expect(calls).toEqual([])
		// New operations are no longer held.
		await Note.create({ data: { text: 'one' } }, M)
		save()
		await running
	} finally {
		vi.useRealTimers()
	}
})

it('completes a caller with its plugins keys, while running (D-351)', async () => {
	const alice = { kind: 'user', user: { id: 'alice' } } as const
	await expect(completedCaller(alice)).rejects.toThrow(
		'No application is running.',
	)
	const badging = definePlugin({
		name: 'badging',
		manifest: { ...manifest, name: 'badging' },
		caller: ({ user }) => ({ badge: `${user.id}'s` }),
	})
	const app = defineApp({
		database: memory(),
		models: [Note],
		plugins: [badging.plugin()],
	})
	await app.start()
	stop = async () => app.stop()
	expect(await completedCaller(alice)).toMatchObject({ badge: "alice's" })
})
