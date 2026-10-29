// A live read over Server-Sent Events (D-154): a running server's list and
// row followed, grown, resumed after a cut or a stop, started afresh out of
// step, and failed with the server's error.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveError } from './error.ts'
import { liveFetch } from './fetch.ts'
import type { Running } from './test/server.ts'
import { M, Task, errors, started } from './test/server.ts'

let running: Running | undefined
const stops: (() => void)[] = []
afterEach(async () => {
	for (const stop of stops.splice(0)) stop()
	vi.restoreAllMocks()
	await running?.stop()
	running = undefined
})

const ada = { authorization: 'ada' }
const ranked = (first: number) =>
	`orderBy=${encodeURIComponent('[{"rank":"asc"}]')}&first=${first}`

/** Starts the server; returns its tasks' URL. */
async function tasks(): Promise<string> {
	running = await started()
	return `${running.origin}/api/tasks`
}

type Seen = {
	/** The next result, or the one after `count` were seen. */
	readonly at: (count: number) => Promise<unknown>
	readonly results: unknown[]
	readonly failures: LiveError[]
	readonly stop: () => void
}

/** Subscribes to `live`, keeping what it hands. */
function seen<T>(live: ReturnType<typeof liveFetch<T>>): Seen {
	const results: unknown[] = []
	const failures: LiveError[] = []
	const waiters: (() => void)[] = []
	const wake = () => {
		for (const waiter of waiters.splice(0)) waiter()
	}
	const stop = live.subscribe(
		(result) => {
			results.push(result)
			wake()
		},
		(error) => {
			failures.push(error)
			wake()
		},
	)
	stops.push(stop)
	const at = async (count: number): Promise<unknown> => {
		while (results.length < count) {
			await new Promise<void>((done) => waiters.push(done))
		}
		return results[count - 1]
	}
	return { at, results, failures, stop }
}

const failed = async (watched: Seen) => {
	while (watched.failures.length === 0) await waited(5)
	return watched.failures[0]
}

const waited = async (ms: number) =>
	new Promise((done) => {
		setTimeout(done, ms)
	})

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null

/** The titles of a connection's nodes. */
function titles(result: unknown): unknown {
	const edges: unknown = isRecord(result) ? result['edges'] : undefined
	if (!Array.isArray(edges)) return result
	return edges.map((edge: unknown) =>
		isRecord(edge) && isRecord(edge['node']) ? edge['node']['title'] : edge,
	)
}

/** What `fetch` was asked for, as a URL. */
const hrefOf = (input: string | URL | Request): string =>
	typeof input === 'string'
		? input
		: input instanceof URL
			? input.href
			: input.url

/** The URLs `fetch` was asked for, from now on. */
function requested(): string[] {
	const urls: string[] = []
	const real = globalThis.fetch
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		urls.push(hrefOf(input))
		return real(input, init)
	})
	return urls
}

describe('liveFetch', () => {
	it('hands each whole list, the current one first to a late listener', async () => {
		const url = await tasks()
		const live = liveFetch(
			`${url}?${ranked(2)}&select=${encodeURIComponent('{"id":true,"title":true}')}`,
			{
				headers: ada,
			},
		)
		const first = seen(live)
		expect(titles(await first.at(1))).toEqual(['a', 'b'])
		await Task.create({ data: { title: 'z', rank: 0, owner: 'ada' } }, M)
		expect(titles(await first.at(2))).toEqual(['z', 'a'])
		const late = seen(live)
		expect(titles(await late.at(1))).toEqual(['z', 'a'])
		expect(errors).toEqual([])
	})

	it('grows a list by resuming it, even with no row to add', async () => {
		const url = await tasks()
		const urls = requested()
		const live = liveFetch(`${url}?${ranked(2)}`, { headers: ada })
		const watched = seen(live)
		await watched.at(1)
		await live.fetchMore({ first: 2 })
		expect(watched.results.map(titles).at(-1)).toEqual(['a', 'b', 'c'])
		await live.fetchMore({ first: 1 })
		expect(urls.map((each) => new URL(each).searchParams.get('first'))).toEqual(
			['2', '4', '5'],
		)
		expect(urls.slice(1).every((each) => each.includes('resume='))).toBe(true)
	})

	it('reconnects with its token when the stream is cut', async () => {
		const url = await tasks()
		const urls: string[] = []
		const cuts: AbortController[] = []
		const real = globalThis.fetch
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
			urls.push(hrefOf(input))
			const cut = new AbortController()
			cuts.push(cut)
			const signal = AbortSignal.any([cut.signal, init?.signal ?? cut.signal])
			return real(input, { ...init, signal })
		})
		const watched = seen(liveFetch(`${url}?${ranked(3)}`, { headers: ada }))
		await watched.at(1)
		cuts[0]?.abort()
		await Task.create({ data: { title: 'z', rank: 0, owner: 'ada' } }, M)
		expect(titles(await watched.at(2))).toEqual(['z', 'a', 'b'])
		expect(urls[1]).toContain('resume=')
	})

	it('resumes once a listener comes back, and grows while none listens', async () => {
		const url = await tasks()
		const urls = requested()
		const live = liveFetch(`${url}?${ranked(1)}`, { headers: ada })
		const first = seen(live)
		await first.at(1)
		first.stop()
		await live.fetchMore({ first: 1 })
		const again = seen(live)
		expect(titles(await again.at(1))).toEqual(['a'])
		expect(titles(await again.at(2))).toEqual(['a', 'b'])
		expect(urls[1]).toContain('first=2')
		expect(urls[1]).toContain('resume=')
	})

	it('follows a row', async () => {
		const url = await tasks()
		const [task] = await Task.findMany({ where: { title: 'a' } }, M)
		const watched = seen(
			liveFetch(`${url}/${task?.id ?? ''}`, { headers: ada }),
		)
		expect(await watched.at(1)).toMatchObject({ title: 'a' })
		await Task.update(
			{ where: { id: task?.id ?? '' }, data: { title: 'A' } },
			M,
		)
		expect(await watched.at(2)).toMatchObject({ title: 'A' })
	})

	it('fails with what the server refused, and needs the rows’ ids', async () => {
		const url = await tasks()
		const refused = seen(liveFetch(`${url}?first=5000`, { headers: ada }))
		expect(await failed(refused)).toMatchObject({
			name: 'LiveError',
			code: 'BAD_USER_INPUT',
			message: 'first is at most 100 on Task.',
		})
		const select = encodeURIComponent('{"title":true}')
		const anonymous = seen(
			liveFetch(`${url}?${ranked(2)}&select=${select}`, { headers: ada }),
		)
		await anonymous.at(1)
		await Task.create({ data: { title: 'z', rank: 0, owner: 'ada' } }, M)
		expect(await failed(anonymous)).toMatchObject({
			code: 'BAD_USER_INPUT',
			message: "Select the node's id to follow a live list.",
		})
	})

	it('refuses to grow a row or by a count that is not positive', async () => {
		const url = await tasks()
		await expect(liveFetch(`${url}/x`).fetchMore({ first: 1 })).rejects.toThrow(
			'fetchMore grows a live list: its URL needs first or take.',
		)
		await expect(
			liveFetch(`${url}?first=x`).fetchMore({ first: 1 }),
		).rejects.toThrow(
			'fetchMore grows a live list: its URL needs first or take.',
		)
		await expect(
			liveFetch(`${url}?first=1`).fetchMore({ first: 0 }),
		).rejects.toThrow('first must be a positive integer.')
	})
})

/** A response that sends `blocks`, then ends. */
const sse = (...blocks: readonly string[]) =>
	new Response(blocks.map((block) => `${block}\n\n`).join(''), {
		headers: { 'content-type': 'text/event-stream' },
	})

/** `fetch` answering with `responses` in turn, then waiting forever. */
function answering(...responses: readonly Response[]): string[] {
	const urls: string[] = []
	vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
		urls.push(hrefOf(input))
		const next = responses[urls.length - 1]
		if (next !== undefined) return next
		return new Promise((_, reject) => {
			init?.signal?.addEventListener('abort', () =>
				reject(new Error('Aborted.')),
			)
		})
	})
	return urls
}

const data = (revision: number, rows: readonly string[]) =>
	`id: ${revision}\nevent: data\ndata: ${JSON.stringify(rows.map((id) => ({ id })))}`
const live = (revision: number, changes: readonly unknown[]) =>
	`id: ${revision}\nevent: live\ndata: ${JSON.stringify({ revision, changes })}`

describe('liveFetch out of step', () => {
	it('reads the list afresh when a revision is missed or a row is unknown', async () => {
		const urls = answering(
			sse('event: resume\ndata: "t"', data(1, ['a']), live(3, [])),
			sse(
				'event: resume\ndata: "u"',
				data(1, ['a']),
				live(2, [{ remove: 'x' }]),
			),
			sse(data(1, ['b']), 'event: live\ndata: "broken"'),
			sse(data(1, ['c'])),
		)
		const watched = seen(liveFetch('http://x/api/tasks?take=1'))
		expect(await watched.at(4)).toEqual([{ id: 'c' }])
		expect(urls).toEqual([
			'http://x/api/tasks?take=1',
			'http://x/api/tasks?take=1',
			'http://x/api/tasks?take=1',
			'http://x/api/tasks?take=1',
		])
	})

	it('reconnects after a server error or what it cannot read, backing off', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
		try {
			const urls = answering(
				new Response('Bad gateway', { status: 502 }),
				sse('event: resume\ndata: "t"', 'event: data\ndata: {'),
				sse(data(1, ['a'])),
			)
			const watched = seen(liveFetch('http://x/api/tasks?take=1'))
			await vi.advanceTimersByTimeAsync(99)
			expect(urls).toHaveLength(1)
			await vi.advanceTimersByTimeAsync(1)
			expect(urls).toHaveLength(2)
			// The token's event reset the backoff.
			await vi.advanceTimersByTimeAsync(100)
			expect(urls[2]).toBe('http://x/api/tasks?take=1&resume=t')
			expect(await watched.at(1)).toEqual([{ id: 'a' }])
		} finally {
			vi.useRealTimers()
		}
	})

	it('fails on an error event, and a refusal it cannot read, rejecting a grow', async () => {
		answering(
			sse(data(1, ['a'])),
			sse(
				'event: error\ndata: {"code":"INTERNAL","message":"The live read closed."}',
			),
			new Response('Nope', { status: 403 }),
		)
		const fetched = liveFetch('http://x/api/tasks?take=1')
		const watched = seen(fetched)
		await watched.at(1)
		const growing = fetched.fetchMore({ first: 1 })
		await expect(growing).rejects.toMatchObject({
			code: 'INTERNAL',
			message: 'The live read closed.',
		})
		const other = seen(liveFetch('http://x/api/tasks?take=1'))
		expect(await failed(other)).toMatchObject({
			code: 'INTERNAL',
			message: 'The live read failed.',
		})
	})
})
