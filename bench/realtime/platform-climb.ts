// How the platform benches climb: a rate of writes sustained for some seconds,
// then what was told and how long after each write was due. Whoever is told
// counts: the engine's callbacks, or clients at the far end of the wire.
import { monitorEventLoopDelay } from 'node:perf_hooks'
import type { Bench } from './shared.ts'
import { median, waited } from './shared.ts'

const ranked = (sorted: readonly number[], at: number): number =>
	sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * at))] ?? 0

/** Who counts the deliveries of the writes under way. */
export type Told = {
	/** Forgets what was told, and counts from now on. */
	readonly begin: () => void | Promise<void>
	/** How many writes' deliveries arrived so far. */
	readonly count: () => number
	/** Stops counting, and gives how long each delivery took. */
	readonly end: () => readonly number[] | Promise<readonly number[]>
}

export type Climb = {
	readonly bench: Bench
	readonly rates: readonly number[]
	readonly seconds: number
	readonly users: number
	/** Who hears of one write. */
	readonly hearing: number
	/** The index of the user the walk reaches last. */
	readonly last: number
	readonly write: (due: number, index: number) => Promise<unknown>
	readonly told: Told
	/** How many runs of the badges so far, 0 where nothing counts them. */
	readonly runs: () => number
}

/** The lone write, then a row of the table for each rate. */
export async function climbing(climb: Climb): Promise<void> {
	const { bench, hearing, last, rates, runs, seconds, told, users, write } =
		climb
	const settled = async (expected: number, patience: number) => {
		const start = Date.now()
		let seen = told.count()
		let changed = Date.now()
		while (told.count() < expected && Date.now() - changed < patience) {
			await waited(5)
			if (told.count() !== seen) {
				seen = told.count()
				changed = Date.now()
			}
		}
		return Date.now() - start
	}
	const lone: { ms: number; statements: number; turn: number }[] = []
	for (let run = 0; run < 3; run += 1) {
		await told.begin()
		const before = bench.statements()
		const due = Date.now()
		await write(due, last)
		await settled(hearing, 60_000)
		const ms = Date.now() - due
		await bench.quiet()
		await told.end()
		lone.push({
			ms,
			statements: bench.statements() - before,
			turn: Date.now() - due,
		})
	}
	const middle = (key: 'ms' | 'statements' | 'turn') =>
		median(lone.map((entry) => entry[key]))
	console.log(
		`A lone write, the walk's last viewers told: ${middle('ms')} ms, ${middle('statements')} statements, all quiet after ${middle('turn')} ms.\n`,
	)
	console.log(
		'| Asked /s | Done /s | Commit p50 | Told p50 | Told p95 | Told max | Told | Drain s | SQL /s | Badge runs | CPU % | Longest stall | Holds |\n| --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |',
	)
	const loop = monitorEventLoopDelay({ resolution: 10 })
	for (const rate of rates) {
		await told.begin()
		const beforeRuns = runs()
		const beforeStatements = bench.statements()
		const beforeCpu = process.cpuUsage()
		loop.reset()
		loop.enable()
		const began = Date.now()
		const total = rate * seconds
		const commits: number[] = []
		let done = 0
		let started = 0
		const running = new Set<Promise<void>>()
		while (started < total) {
			// A whole millisecond: the writes carry it as text, and it is read back.
			const due = began + Math.floor((started * 1000) / rate)
			const now = Date.now()
			if (due > now) {
				await waited(Math.min(5, due - now))
				continue
			}
			// Writers past a pool's worth wait, as requests would.
			if (running.size >= 64) {
				await Promise.race(running)
				continue
			}
			// Anyone: a viewer's place in the flush's walk must not favour it.
			const index = Math.floor(Math.random() * users)
			started += 1
			const task: Promise<void> = write(due, index).then(() => {
				commits.push(Date.now() - due)
				done += 1
				running.delete(task)
				return undefined
			})
			running.add(task)
		}
		await Promise.all(running)
		const wrote = (Date.now() - began) / 1000
		const drain = (await settled(hearing * total, 30_000)) / 1000
		const wall = (Date.now() - began) / 1000
		const delays = await told.end()
		loop.disable()
		const cpu = process.cpuUsage(beforeCpu)
		const sorted = delays.toSorted((a, b) => a - b)
		const commit = ranked(
			commits.toSorted((a, b) => a - b),
			0.5,
		)
		const holds =
			done / wrote >= rate * 0.95 &&
			ranked(sorted, 0.95) < 1000 &&
			sorted.length > 0
		console.log(
			`| ${rate} | ${(done / wrote).toFixed(0)} | ${commit} | ${ranked(sorted, 0.5)} | ${ranked(sorted, 0.95)} | ${sorted.at(-1) ?? 0} | ${sorted.length} | ${drain.toFixed(1)} | ${((bench.statements() - beforeStatements) / wall).toFixed(0)} | ${runs() - beforeRuns} | ${(((cpu.user + cpu.system) / 1e6 / wall) * 100).toFixed(0)} | ${(loop.max / 1e6).toFixed(0)} | ${holds ? 'yes' : 'NO'} |`,
		)
		if (ranked(sorted, 0.95) > 30_000) break
		await waited(2000)
	}
}
