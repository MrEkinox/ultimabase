// A live function (D-154): its run as the subscriber, with the reads it made,
// run again once a write may change one of them, after a quiet wait. Each new
// result is sent whole; one equal to the last is not. A wake during a run
// runs it once more after it, and an error closes it.
import { isDeepStrictEqual } from 'node:util'
import type { Caller, ExposedFunction } from 'ultimabase'
import type { Recorded } from 'ultimabase/internal'
import { recording } from 'ultimabase/internal'
import type { Batch } from './changes.ts'
import type { LiveMessage } from './messages.ts'
import type { Owner, Readers } from './readers.ts'
import type { Loader } from './loader.ts'
import { anyStale, mayBeStale } from './stale.ts'
import type { Waited } from './tasks.ts'

/** A function's name, with its plugin's for a plugin's (D-113). */
export const ownerOf = (fn: ExposedFunction): string =>
	fn.plugin === undefined ? fn.name : `${fn.plugin}.${fn.name}`

/** How long a live function's wake waits for quiet, in milliseconds. */
export const debounce = 50

/** The longest a run waits after the first wake, however many follow. */
const longest = 1000

export type ComputedOptions = {
	/** The function's result for `caller`, shaped as its transport sends it. */
	readonly compute: (caller: Caller) => Promise<unknown>
	readonly send: (message: LiveMessage) => void
	/** How long a wake waits for quiet, in milliseconds. */
	readonly debounce: number
	/** Runs once a run kept its reads and expiry. */
	readonly onRun: () => void
	/** Runs once an error closed it, after it sent so. */
	readonly onFail: () => void
	/** The index it is followed in, for its owner (D-256). */
	readonly readers: Readers
	readonly owner: Owner
}

type Ran = Awaited<ReturnType<typeof recording<unknown>>>

export class Computed {
	readonly #options: ComputedOptions
	#caller: Caller
	/** What the last run read. */
	reads: readonly Recorded[] = []
	/** When the last run stops holding, as a caller that expires. */
	expires: Date | undefined
	#revision = 0
	#last: unknown
	#first: number | undefined
	#timer: NodeJS.Timeout | undefined
	#running: Promise<void> | undefined
	#again = false
	#closed = false

	constructor(options: ComputedOptions, caller: Caller) {
		this.#options = options
		this.#caller = caller
		// Followed from now: a flush visits a first run as it visits any other.
		options.readers.followReads(options.owner, this, [])
	}

	/** Runs the function, a flush visiting it until it read. */
	async #ran(): Promise<Ran> {
		const compute = async () => this.#options.compute(this.#caller)
		return this.#options.readers.during(this, async () => recording(compute))
	}

	/** Runs it a first time; an error is thrown, as a refused subscription. */
	async start(): Promise<void> {
		// Its connection closed while it waited for its turn (D-277).
		if (this.#closed) return
		this.#kept(await this.#ran())
	}

	/** Wakes it when a write in `batch` may change what it read. */
	apply(batch: Batch, loader: Loader, missed: boolean): Waited {
		if (this.#closed) return undefined
		if (missed) {
			this.#wake()
			return undefined
		}
		return mayBeStale(this.reads, batch)
			? this.#judge(batch, loader)
			: undefined
	}

	async #judge(batch: Batch, loader: Loader): Promise<void> {
		if (await anyStale(this.reads, batch, loader)) this.#wake()
	}

	/** Runs it again at once as `caller`, whose rights changed. */
	async replan(caller: Caller): Promise<void> {
		this.#caller = caller
		return this.#rerun()
	}

	/** Sends the last result again, as after messages were dropped. */
	resend(): void {
		if (this.#closed) return
		this.#revision += 1
		const value = this.#last
		this.#options.send({ kind: 'value', revision: this.#revision, value })
	}

	close(): void {
		this.#closed = true
		clearTimeout(this.#timer)
		this.#timer = undefined
		this.#options.readers.forget(this)
	}

	#wake(): void {
		const now = Date.now()
		this.#first ??= now
		clearTimeout(this.#timer)
		const wait = Math.min(this.#options.debounce, this.#first + longest - now)
		this.#timer = setTimeout(
			() => {
				this.#rerun().catch(() => undefined)
			},
			Math.max(wait, 0),
		)
		this.#timer.unref()
	}

	async #rerun(): Promise<void> {
		clearTimeout(this.#timer)
		this.#timer = undefined
		this.#first = undefined
		if (this.#closed) return
		if (this.#running !== undefined) {
			this.#again = true
			return this.#running
		}
		this.#running = this.#run()
		try {
			await this.#running
		} finally {
			this.#running = undefined
		}
		if (!this.#again) return
		this.#again = false
		return this.#rerun()
	}

	async #run(): Promise<void> {
		let ran: Ran
		try {
			ran = await this.#ran()
		} catch (error) {
			if (this.#closed) return
			this.close()
			this.#options.send({ kind: 'closed', error })
			return this.#options.onFail()
		}
		if (!this.#closed) this.#kept(ran)
	}

	/** Keeps a run's reads and sends its result, unless the last was equal. */
	#kept(ran: Ran): void {
		this.reads = ran.reads
		const { readers, owner } = this.#options
		if (!this.#closed) readers.followReads(owner, this, ran.reads)
		this.expires = ran.expires
		this.#options.onRun()
		if (this.#revision > 0 && isDeepStrictEqual(ran.result, this.#last)) {
			return
		}
		this.#last = ran.result
		this.#revision += 1
		const value = ran.result
		this.#options.send({ kind: 'value', revision: this.#revision, value })
	}
}
