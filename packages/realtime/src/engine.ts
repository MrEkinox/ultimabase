// The realtime engine (D-154, D-271): at most one flush each 50 ms reads each
// changed row once and hands the batch to the viewers holding a read it may
// concern (D-256), a few at a time.
// Each viewer's caller is built again on its own timer, and when it expires.
import type { Changed } from 'ultimabase'
import { liveSchema, recording, SharedReads } from 'ultimabase/internal'
import { batchOf } from './changes.ts'
import { whoOf } from './checked.ts'
import type { Owner } from './readers.ts'
import { Readers } from './readers.ts'
import { Loader } from './loader.ts'
import type { Settings } from './settings.ts'
import { builtAgain } from './settings.ts'
import { Viewer } from './viewer.ts'

/** The least between two flushes: the writes in between share one message. */
const gather = 50
/** How many viewers follow a flush at once. */
const concurrency = 8
/** How many viewers one turn of the chain builds or reads again (D-315). */
const perTurn = 32

/** What a turn of the chain does to the viewers it takes. */
type Task = (taken: readonly Viewer[]) => Promise<void>

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
	readonly #refresh: number
	/** The viewers to build again, in the order they came due. */
	readonly #due = new Set<Viewer>()
	/** The viewers to read again whole, as changes were missed (D-318). */
	readonly #owed = new Set<Viewer>()
	#changes: Changed[] = []
	#stopped = false
	#timer: NodeJS.Timeout | undefined
	#flushed = 0
	#chain: Promise<void> = Promise.resolve()

	constructor(settings: Settings, refresh: number) {
		this.#settings = settings
		this.#refresh = refresh
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
			onDue: () => this.#rebuildSoon(viewer),
		})
		this.#viewers.add(viewer)
		const refresh = setInterval(() => this.#rebuildSoon(viewer), this.#refresh)
		refresh.unref()
		viewer.onClose(() => clearInterval(refresh))
		return viewer
	}

	/** Whether `request` is `viewer`'s user, read without following it. */
	async sameUser(viewer: Viewer, request: Request): Promise<boolean> {
		const { identified } = await builtAgain(this.#settings, request)
		return (
			identified !== undefined &&
			whoOf(identified.result) === whoOf(viewer.caller)
		)
	}

	changed(changes: readonly Changed[]): void {
		this.#changes.push(...changes)
		this.#schedule()
	}

	/** Reads every viewer again, a few at a time between flushes (D-318). */
	missed(): void {
		this.#inTurns(this.#owed, [...this.#viewers], async (viewers) =>
			this.#reread(viewers),
		)
	}

	async stop(): Promise<void> {
		this.#stopped = true
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
			// The event loop's clock lags behind: a timer may ring early (D-271).
			if (performance.now() < this.#flushed + gather) {
				this.#schedule()
				return
			}
			this.#flushed = performance.now()
			this.#chain = this.#chain.then(async () => this.#flush())
		}, wait)
	}

	async #flush(): Promise<void> {
		const changes = this.#changes
		this.#changes = []
		// A flush that outlasted the gather took these with its own: the walk of
		// every viewer would cost as much for nothing, and hold the loop (D-255).
		if (changes.length === 0) return
		const batch = batchOf(changes, liveSchema())
		const shared = new SharedReads()
		const loader = new Loader(shared)
		try {
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

	/** Builds `viewer` again in a coming turn of the chain (D-315). */
	#rebuildSoon(viewer: Viewer): void {
		this.#inTurns(this.#due, [viewer], async (viewers) =>
			bounded(viewers, concurrency, async (due) =>
				this.#guarded(due, async () => due.rebuild()),
			),
		)
	}

	/** Reads `viewers` again whole: changes may have gone unheard (D-318). */
	async #reread(viewers: readonly Viewer[]): Promise<void> {
		const batch = batchOf([], liveSchema())
		const shared = new SharedReads()
		const loader = new Loader(shared)
		try {
			await bounded(viewers, concurrency, (viewer) =>
				this.#guarded(viewer, () => viewer.flush(batch, loader, 'all')),
			)
		} finally {
			shared.stop()
		}
	}

	/**
	 * Adds `viewers` to `queue`, which coming turns of the chain take
	 * `perTurn` at a time: flushes go in between (D-315).
	 */
	#inTurns(queue: Set<Viewer>, viewers: readonly Viewer[], task: Task): void {
		const idle = queue.size === 0
		for (const viewer of viewers) queue.add(viewer)
		if (idle && queue.size > 0) this.#turn(queue, task)
	}

	/** Takes the first viewers of `queue` in a coming turn of the chain. */
	#turn(queue: Set<Viewer>, task: Task): void {
		this.#chain = this.#chain.then(async () => this.#took(queue, task))
	}

	/** The first viewers of `queue`, the others left for a later turn. */
	async #took(queue: Set<Viewer>, task: Task): Promise<void> {
		const taken: Viewer[] = []
		for (const viewer of queue) {
			if (taken.push(viewer) === perTurn && !this.#stopped) break
		}
		for (const viewer of taken) queue.delete(viewer)
		// Once the application stopped, its viewers are closed.
		if (!this.#stopped) await task(taken)
		if (queue.size > 0) this.#turn(queue, task)
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
