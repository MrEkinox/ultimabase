// What a storm of connections costs: some users are connected and writing,
// the rest arrive within `over` ms, and a new visitor asks something every
// 100 ms. Each waits for what it waits for in a browser.
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { Worker } from 'node:worker_threads'
import type { Command, Reply } from './platform-wire-clients.ts'
import type { Bench } from './shared.ts'
import { waited } from './shared.ts'

type Stormed = Extract<Reply, { kind: 'stormed' }>

export type Storm = {
	readonly bench: Bench
	readonly over: number
	readonly arriving: number
	readonly connected: number
	/** The writes a second the connected users make, each told to them. */
	readonly writes: number
	/** The writes' indexes stay under this. */
	readonly reach: number
	readonly write: (due: number, index: number) => Promise<unknown>
	readonly origin: string
	readonly authorization: string
	readonly storm: () => Promise<readonly Stormed[]>
	readonly begin: () => Promise<void>
	readonly end: () => Promise<readonly number[]>
}

const ranks = (values: readonly number[]): string => {
	const sorted = values.toSorted((a, b) => a - b)
	const at = (rank: number) =>
		sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * rank))] ?? 0
	return `${at(0.5).toFixed(0)} / ${at(0.95).toFixed(0)} / ${(sorted.at(-1) ?? 0).toFixed(0)}`
}

/** Runs the storm, then prints what each waited, in ms: p50 / p95 / max. */
export async function storming(storm: Storm): Promise<void> {
	const prober = new Worker(
		new URL('platform-wire-clients.ts', import.meta.url),
	)
	const told = (command: Command) => {
		// oxlint-disable-next-line unicorn/require-post-message-target-origin -- A worker's, not a window's.
		prober.postMessage(command)
	}
	const probes = new Promise<Extract<Reply, { kind: 'probes' }>>((resolve) => {
		prober.on('message', (reply: Reply) => {
			if (reply.kind === 'probes') resolve(reply)
			if (reply.kind === 'failed') throw new Error(reply.message)
		})
	})
	const loop = monitorEventLoopDelay({ resolution: 10 })
	await storm.begin()
	loop.enable()
	told({
		kind: 'probe',
		url: storm.origin,
		authorization: storm.authorization,
		body: JSON.stringify({
			query: 'query { users(first: 1) { edges { node { name } } } }',
		}),
		every: 100,
	})

	const running = new Set<Promise<unknown>>()
	const writing = { on: true }
	const began = Date.now()
	const writer = (async () => {
		for (let done = 0; writing.on; done += 1) {
			const due = began + Math.floor((done * 1000) / storm.writes)
			if (due > Date.now()) await waited(due - Date.now())
			const index = Math.floor(Math.random() * storm.reach)
			const task: Promise<unknown> = storm.write(due, index).finally(() => {
				running.delete(task)
			})
			running.add(task)
		}
	})()

	const replies = await storm.storm()
	const whole = (Date.now() - began) / 1000
	await waited(2000)
	writing.on = false
	await writer
	await Promise.all(running)
	told({ kind: 'probed' })
	const { delays, failed } = await probes
	await waited(2000)
	const heard = await storm.end()
	loop.disable()
	await prober.terminate()

	const lost: Record<string, number> = {}
	for (const reply of replies) {
		for (const [why, times] of Object.entries(reply.lost)) {
			lost[why] = (lost[why] ?? 0) + times
		}
	}
	console.log(
		`${new Date().toISOString().slice(0, 10)}, Node ${process.version}: ${storm.arriving} arriving within ${storm.over / 1000} s, ${storm.connected} connected, ${storm.writes} writes a second.`,
	)
	console.log(
		'| Over s | All in s | First state | All states | New visitor | Visitors failed | Told, connected | Longest stall | Attempts lost |\n| --: | --: | --: | --: | --: | --: | --: | --: | --- |',
	)
	console.log(
		`| ${storm.over / 1000} | ${whole.toFixed(1)} | ${ranks(replies.flatMap(({ first }) => first))} | ${ranks(replies.flatMap(({ all }) => all))} | ${ranks(delays)} | ${failed} of ${delays.length + failed} | ${ranks(heard)} | ${(loop.max / 1e6).toFixed(0)} | ${JSON.stringify(lost)} |`,
	)
	await storm.bench.quiet()
}
