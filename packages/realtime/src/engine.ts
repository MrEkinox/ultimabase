// The realtime engine (D-154, D-271): at most one flush each 50 ms reads each
// changed row once and hands the batch to the viewers holding a read it may
// concern (D-256), a few at a time.
// Every viewer's caller is built again on a timer, and when it expires.
import type { Changed } from 'ultimabase'
import { liveSchema, recording, SharedReads } from 'ultimabase/internal'
import { batchOf } from './changes.ts'
import type { Owner } from './readers.ts'
import { Readers } from './readers.ts'
import { Loader } from './loader.ts'
import type { Settings } from './settings.ts'
import { Viewer } from './viewer.ts'

/** The least between two flushes: the writes in between share one message. */
const gather = 50
/** How many viewers follow a flush at once. */
const concurrency = 8

/** The longest a flush holds the event loop, in milliseconds (D-255). */
const slice = 8

/**
 * Runs `task` on each of `items`, `limit` at a time. Tasks that wait for
 * nothing would hold the event loop until the last: writes, requests and
 * timers get their turn every `slice`.
 */
async function bounded<T>(
	items: readonly T[],
	limit: number,
	task: (item: T) => Promise<void>,
): Promise<void> {
	let next = 0
	let since = performance.now()
	/** The turn every worker waits for: each its own would run them all in one. */
	let turn: Promise<void> | undefined
	const rest = async (): Promise<void> => {
		await new Promise(setImmediate)
		turn = undefined
		since = performance.now()
	}
	const worker = async (): Promise<void> => {
		while (next < items.length) {
			if (performance.now() - since > slice) {
				turn ??= rest()
				await turn
				continue
			}
			const item = items[next]
			next += 1
			if (item !== undefined) await task(item)
		}
	}
	await Promise.all(Array.from({ length: limit }, worker))
}

export class Engine {
	readonly #settings: Settings
	readonly #viewers = new Set<Viewer>()
	readonly #readers = new Readers()
	readonly #refresh: NodeJS.Timeout
	#changes: Changed[] = []
	#missed = false
	#stopped = false
	#timer: NodeJS.Timeout | undefined
	#flushed = 0
	#chain: Promise<void> = Promise.resolve()

	constructor(settings: Settings, refresh: number) {
		this.#settings = settings
		this.#refresh = setInterval(() => {
			this.#chain = this.#chain.then(async () => this.#rebuild())
		}, refresh)
		this.#refresh.unref()
	}

	/** A viewer for `request`'s caller, kept until it closes. */
	async connect(request: Request): Promise<Viewer> {
		const { identify, opens } = this.#settings
		const identified = await opens.arrive(async () =>
			recording(async () => identify(request)),
		)
		const viewer = new Viewer(this.#settings, request, identified, {
			readers: this.#readers,
			onClose: () => this.#viewers.delete(viewer),
			onDue: () => {
				this.#chain = this.#chain.then(async () =>
					this.#guarded(viewer, async () => viewer.rebuild()),
				)
			},
		})
		this.#viewers.add(viewer)
		return viewer
	}

	changed(changes: readonly Changed[]): void {
		this.#changes.push(...changes)
		this.#schedule()
	}

	missed(): void {
		this.#missed = true
		this.#schedule()
	}

	async stop(): Promise<void> {
		this.#stopped = true
		clearInterval(this.#refresh)
		clearTimeout(this.#timer)
		this.#timer = undefined
		for (const viewer of this.#viewers) viewer.close()
		await this.#chain
	}

	#schedule(): void {
		// A change the adapter delivers once the application stopped is late.
		if (this.#stopped || this.#timer !== undefined) return
		// A change after a quiet goes at once: nothing is left to gather (D-271).
		const wait = Math.max(this.#flushed + gather - performance.now(), 0)
		this.#timer = setTimeout(() => {
			this.#timer = undefined
			this.#flushed = performance.now()
			this.#chain = this.#chain.then(async () => this.#flush())
		}, wait)
	}

	async #flush(): Promise<void> {
		const changes = this.#changes
		const missed = this.#missed
		this.#changes = []
		this.#missed = false
		// A flush that outlasted the gather took these with its own: the walk of
		// every viewer would cost as much for nothing, and hold the loop (D-255).
		if (changes.length === 0 && !missed) return
		const batch = batchOf(changes, liveSchema())
		const shared = new SharedReads()
		const loader = new Loader(shared)
		try {
			if (missed) {
				await bounded([...this.#viewers], concurrency, (viewer) =>
					this.#guarded(viewer, () => viewer.flush(batch, loader, 'all')),
				)
				return
			}
			const concerned = await this.#readers.concerned(batch, loader)
			// No async wrappers: a flush makes these calls for each viewer.
			await bounded([...concerned], concurrency, ([viewer, reads]) =>
				this.#guarded(viewer, () => viewer.flush(batch, loader, reads)),
			)
		} finally {
			// Code that outlives the flush reads what is stored by then (D-295).
			shared.stop()
		}
	}

	async #rebuild(): Promise<void> {
		await bounded([...this.#viewers], concurrency, async (viewer) =>
			this.#guarded(viewer, async () => viewer.rebuild()),
		)
	}

	/** A viewer that fails is logged and ended as failed; the others go on. */
	async #guarded(viewer: Owner, task: () => Promise<void>): Promise<void> {
		try {
			await task()
		} catch (error) {
			this.#settings.logger.error({ err: error }, 'A live viewer failed.')
			viewer.end(true)
		}
	}
}
