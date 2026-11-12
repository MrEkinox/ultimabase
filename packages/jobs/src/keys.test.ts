// A job's key (D-365) on `memory()`: a run of a key waiting adds none, keeps
// its input and takes the earlier due time; a run of a key enqueued while
// one runs starts once it ends; a failed run frees its key.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { runJobs, testApplication } from '@ultimabase/testing'
import type { Logger } from 'ultimabase'
import { defineApp, memory } from 'ultimabase'
import { defineJob, jobsPlugin } from './index.ts'
import { JobsRun, M } from './model.ts'

const logger: Logger = {
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
	child: () => logger,
}

// The runs wait for the gate; `release` opens it.
let release: () => void = () => undefined
let gate: Promise<void> = Promise.resolve()
function shut(): void {
	gate = new Promise((resolve) => {
		release = resolve
	})
}

// The notes of the runs that ended, in order; the runs running, by account.
const ended: string[] = []
const runs = new Map<string, number>()
let overlapped = false
let failing = ''
const sync = defineJob({
	name: 'sync',
	input: z.object({ account: z.string(), note: z.string() }),
	key: ({ account }) => account,
	run: async ({ input }) => {
		const count = (runs.get(input.account) ?? 0) + 1
		if (count > 1) overlapped = true
		runs.set(input.account, count)
		try {
			await gate
		} finally {
			runs.set(input.account, count - 1)
		}
		if (input.note === failing) throw new Error('Not yet.')
		ended.push(input.note)
	},
})
// A key the types refuse, as plain JavaScript may return: the guard lies.
const notString: unknown = 0
const passes = (value: unknown): value is string => typeof value !== 'symbol'
const odd = defineJob({
	name: 'odd',
	key: () => (passes(notString) ? notString : ''),
	run: () => undefined,
})

const hour = 60 * 60 * 1000
const minute = 60 * 1000

/** The rows of `JobsRun`, by due time. */
const rows = () => JobsRun.findMany({ orderBy: [{ dueAt: 'asc' }] }, M)

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] })
	ended.length = 0
	runs.clear()
	overlapped = false
	failing = ''
})
afterEach(() => {
	release()
	gate = Promise.resolve()
	vi.useRealTimers()
})

describe('a job with a key', () => {
	testApplication(
		defineApp({
			database: memory(),
			models: [],
			plugins: [jobsPlugin({ jobs: [sync, odd] })],
			logger,
		}),
	)

	it('adds no run while one of the key waits: it keeps its input, at the earlier time', async () => {
		const now = Date.now()
		await sync.enqueue({ account: 'a', note: 'first' }, { after: hour })
		await sync.enqueue({ account: 'a', note: 'second' }, { after: minute })
		await sync.enqueue({ account: 'a', note: 'third' }, { after: hour })
		await sync.enqueue({ account: 'b', note: 'other' }, { after: hour })
		expect(await rows()).toMatchObject([
			{ input: { note: 'first' }, dueAt: new Date(now + minute) },
			{ input: { note: 'other' }, dueAt: new Date(now + hour) },
		])
		vi.setSystemTime(now + hour)
		await runJobs()
		expect(ended.toSorted()).toStrictEqual(['first', 'other'])
	})

	it('runs a run enqueued while one of the key runs once it ends', async () => {
		shut()
		await sync.enqueue({ account: 'a', note: 'first' })
		await vi.waitFor(() => {
			expect(runs.get('a')).toBe(1)
		})
		await sync.enqueue({ account: 'a', note: 'second' })
		await sync.enqueue({ account: 'a', note: 'third' })
		await sync.enqueue({ account: 'b', note: 'other' })
		// Another key runs at once; the run of `a` waits.
		await vi.waitFor(() => {
			expect(runs.get('b')).toBe(1)
		})
		await new Promise((resolve) => setTimeout(resolve, 20))
		expect(runs.get('a')).toBe(1)
		expect(await JobsRun.count({}, M)).toBe(3)
		release()
		await runJobs()
		expect(ended.filter((note) => note !== 'other')).toStrictEqual([
			'first',
			'second',
		])
		expect(ended).toContain('other')
		expect(overlapped).toBe(false)
		expect(await rows()).toStrictEqual([])
	})

	it('frees its key when its run fails', async () => {
		shut()
		failing = 'first'
		await sync.enqueue({ account: 'a', note: 'first' })
		await vi.waitFor(() => {
			expect(runs.get('a')).toBe(1)
		})
		await sync.enqueue({ account: 'a', note: 'second' })
		release()
		await runJobs()
		expect(ended).toStrictEqual(['second'])
		// The failed run waits to run again, holding no key.
		expect(await rows()).toMatchObject([
			{ input: { note: 'first' }, attempts: 1, holding: null },
		])
	})

	it('refuses a key that is no string', async () => {
		await expect(odd.enqueue()).rejects.toThrow(
			new TypeError('odd: key returns a string.'),
		)
		expect(await rows()).toStrictEqual([])
	})
})
