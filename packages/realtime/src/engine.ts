// The realtime engine (D-154): changes wait 50 ms, then one flush reads each
// changed row once and hands the batch to every viewer, a few at a time.
// Every viewer's caller is built again on a timer, and when it expires.
import type { Changed } from 'ultimabase'
import { liveSchema, recording } from 'ultimabase/internal'
import { batchOf } from './changes.ts'
import { Loader } from './reads.ts'
import type { Settings } from './viewer.ts'
import { Viewer } from './viewer.ts'

/** How long changes wait, so the writes close together share one message. */
const gather = 50
/** How many viewers follow a flush at once. */
const concurrency = 8

/** Runs `task` on each of `items`, `limit` at a time. */
async function bounded<T>(
	items: readonly T[],
	limit: number,
	task: (item: T) => Promise<void>,
): Promise<void> {
	let next = 0
	const worker = async (): Promise<void> => {
		while (next < items.length) {
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
	readonly #refresh: NodeJS.Timeout
	#changes: Changed[] = []
	#missed = false
	#stopped = false
	#timer: NodeJS.Timeout | undefined
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
		const { identify } = this.#settings
		const identified = await recording(async () => identify(request))
		const viewer = new Viewer(this.#settings, request, identified, {
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
		this.#timer = setTimeout(() => {
			this.#timer = undefined
			this.#chain = this.#chain.then(async () => this.#flush())
		}, gather)
	}

	async #flush(): Promise<void> {
		const changes = this.#changes
		const missed = this.#missed
		this.#changes = []
		this.#missed = false
		const batch = batchOf(changes, liveSchema())
		const loader = new Loader()
		await bounded([...this.#viewers], concurrency, async (viewer) =>
			this.#guarded(viewer, async () => viewer.flush(batch, loader, missed)),
		)
	}

	async #rebuild(): Promise<void> {
		await bounded([...this.#viewers], concurrency, async (viewer) =>
			this.#guarded(viewer, async () => viewer.rebuild()),
		)
	}

	/** A viewer that fails is logged and closed; the others go on. */
	async #guarded(viewer: Viewer, task: () => Promise<void>): Promise<void> {
		try {
			await task()
		} catch (error) {
			this.#settings.logger.error({ err: error }, 'A live viewer failed.')
			viewer.end()
		}
	}
}
