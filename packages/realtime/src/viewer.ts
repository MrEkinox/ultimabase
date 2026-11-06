// A viewer (D-154): one connection's caller and its live reads. The reads
// that built the caller and planned each live read are kept; a write that
// may change one rebuilds the caller, which resyncs the reads whose plan
// changed and closes them all when it is no longer the same user. A caller
// that stops holding at a time is built again then. A live function runs
// again as the rebuilt caller.
import type { Caller } from 'ultimabase'
import type { Recorded } from 'ultimabase/internal'
import { livePlan, recording } from 'ultimabase/internal'
import type { Batch } from './changes.ts'
import { checked, fits, holds, invalid, whoOf, within } from './checked.ts'
import { Computed, debounce, ownerOf } from './computed.ts'
import type { LiveHandle, LiveMessage } from './messages.ts'
import { Live } from './live.ts'
import type { Concerned, Owner, Readers } from './readers.ts'
import { seenBy } from './readers.ts'
import type { Loader } from './loader.ts'
import type { Settings } from './settings.ts'
import { told, waitUntil } from './settings.ts'
import { liveArgs, shapeOf } from './shape.ts'
import { anyStale } from './stale.ts'

type Subscription = {
	readonly model: string
	readonly args: unknown
	readonly row: boolean
	readonly send: (message: LiveMessage) => void
	/** The rows it follows, nested rows included. */
	rows: number
	reads: readonly Recorded[]
	expires: Date | undefined
}

type Built<R> = Awaited<ReturnType<typeof recording<R>>>

export class Viewer implements Owner {
	readonly #settings: Settings
	readonly #readers: Readers
	#request: Request
	/** What runs once it closes, the engine's first (D-163). */
	readonly #listeners: (() => void)[] = []
	readonly #onDue: () => void
	readonly #live = new Map<Live, Subscription>()
	readonly #computed = new Map<Computed, (message: LiveMessage) => void>()
	#caller: Caller
	#reads: readonly Recorded[]
	#expires: Date | undefined
	#due: NodeJS.Timeout | undefined
	#closed = false

	/** `onDue` runs once the caller stops holding, to rebuild it. */
	constructor(
		settings: Settings,
		request: Request,
		identified: Built<Caller>,
		hooks: {
			readonly onClose: () => void
			readonly onDue: () => void
			readonly readers: Readers
		},
	) {
		this.#settings = settings
		this.#readers = hooks.readers
		this.#request = request
		this.#caller = identified.result
		this.#reads = identified.reads
		this.#expires = identified.expires
		this.#listeners.push(hooks.onClose)
		this.#onDue = hooks.onDue
		this.#index()
		this.#reschedule()
	}

	/** The caller the live reads run as, kept current by each rebuild. */
	get caller(): Caller {
		return this.#caller
	}

	get closed(): boolean {
		return this.#closed
	}

	/** A live list of `model`'s rows, from the top of its order. */
	async list(
		model: string,
		args: unknown,
		send: (message: LiveMessage) => void,
	): Promise<LiveHandle> {
		return this.#follow(model, args, false, send)
	}

	/** A live row of `model`, by a unique `where`. */
	async row(
		model: string,
		args: unknown,
		send: (message: LiveMessage) => void,
	): Promise<LiveHandle> {
		return this.#follow(model, args, true, send)
	}

	/**
	 * A live function's result, `compute` as the caller, run again once a
	 * write may change what it read.
	 */
	async value(
		name: string,
		compute: (caller: Caller) => Promise<unknown>,
		send: (message: LiveMessage) => void,
	): Promise<LiveHandle> {
		if (this.#closed) throw new Error('The viewer is closed.')
		const exposed = this.#settings.functions.find((fn) => ownerOf(fn) === name)
		if (!exposed?.used) throw invalid('function', `${name} is not live.`)
		this.#holds()
		const computed = new Computed(
			{
				compute,
				send,
				debounce: exposed.with?.debounce ?? debounce,
				onRun: () => this.#reschedule(),
				onFail: () => this.#computed.delete(computed),
				readers: this.#readers,
				owner: this,
			},
			this.#caller,
		)
		this.#computed.set(computed, send)
		try {
			await computed.start()
		} catch (error) {
			computed.close()
			this.#computed.delete(computed)
			throw error
		}
		return {
			grow: async () => {
				throw invalid('first', `${name} is no live list.`)
			},
			resend: async () => computed.resend(),
			close: () => {
				computed.close()
				this.#computed.delete(computed)
			},
		}
	}

	close(): void {
		if (this.#closed) return
		this.#closed = true
		clearTimeout(this.#due)
		for (const live of this.#live.keys()) live.close()
		this.#live.clear()
		for (const computed of this.#computed.keys()) computed.close()
		this.#computed.clear()
		this.#readers.forget(this)
		told(this.#listeners, this.#settings.logger)
	}

	/** Runs `listener` once it closes, at once when it is closed (D-163). */
	onClose(listener: () => void): void {
		this.#listeners.push(listener)
		if (this.#closed) told(this.#listeners, this.#settings.logger)
	}

	/** What built the caller and each live read's plan. */
	#built(): readonly Recorded[] {
		return [
			...this.#reads,
			...[...this.#live.values()].flatMap((subscription) => subscription.reads),
		]
	}

	/** Tells the index what a write may change for it to be built again. */
	#index(): void {
		if (!this.#closed) this.#readers.followReads(this, this, this.#built())
	}

	/**
	 * Follows `batch`, for the reads it may concern: rebuilds the caller first
	 * when a write may change it.
	 */
	async flush(
		batch: Batch,
		loader: Loader,
		concerned: Concerned,
	): Promise<void> {
		if (this.#closed) return
		const missed = concerned === 'all'
		if (
			missed ||
			(concerned.has(this) && (await anyStale(this.#built(), batch, loader)))
		) {
			await this.rebuild()
		}
		const lives = [...this.#live.keys(), ...this.#computed.keys()]
		const running = lives.flatMap((live) =>
			missed || concerned.has(live)
				? (live.apply(seenBy(concerned, live, batch), loader, missed) ?? [])
				: [],
		)
		await Promise.all(running)
	}

	/**
	 * Follows `request`'s caller from now on, built again at once; whether
	 * it is the same user, as a closed viewer is not.
	 */
	async adopt(request: Request): Promise<boolean> {
		this.#request = request
		await this.rebuild()
		return !this.#closed
	}

	/** The caller read again, as HTTP reads one per request (D-178). */
	async identify(): Promise<Caller | undefined> {
		return (await this.#identified())?.result
	}

	/** The caller built again; the viewer ends when it is another user. */
	async #identified(): Promise<Built<Caller> | undefined> {
		const identified = await recording(async () =>
			this.#settings.identify(this.#request),
		).catch(() => undefined)
		const who = identified && whoOf(identified.result)
		if (who === whoOf(this.#caller)) return identified
		this.end()
		return undefined
	}

	/** Builds the caller again, then each live read's plan. */
	async rebuild(): Promise<void> {
		if (this.#closed) return
		await this.#readers.during(this, async () => this.#rebuilt())
		this.#index()
	}

	async #rebuilt(): Promise<void> {
		const identified = await this.#identified()
		if (identified === undefined) return
		const caller = identified.result
		this.#caller = caller
		this.#reads = identified.reads
		this.#expires = identified.expires
		await Promise.all(
			[...this.#live].map(async ([live, subscription]) => {
				try {
					const { model, args, row } = subscription
					const planned = await recording(async () =>
						livePlan(model, liveArgs(args, row), caller, row),
					)
					subscription.reads = planned.reads
					subscription.expires = planned.expires
					await live.replan(caller, planned.result)
				} catch (error) {
					this.#settings.logger.error(
						{ err: error },
						`A live read of ${subscription.model} cannot be planned: it closes.`,
					)
					this.#drop(live)
				}
			}),
		)
		await Promise.all(
			[...this.#computed.keys()].map(async (computed) =>
				computed.replan(caller),
			),
		)
		this.#reschedule()
	}

	/** Waits for the earliest time the caller or a live read stops holding. */
	#reschedule(): void {
		clearTimeout(this.#due)
		this.#due = undefined
		if (this.#closed) return
		const subscriptions = [...this.#live.values(), ...this.#computed.keys()]
		const wait = waitUntil([
			this.#expires,
			...subscriptions.map(({ expires }) => expires),
		])
		if (wait === undefined) return
		this.#due = setTimeout(this.#onDue, wait)
		this.#due.unref()
	}

	#drop(live: Live): void {
		const subscription = this.#live.get(live)
		live.close()
		this.#live.delete(live)
		subscription?.send({ kind: 'closed' })
	}

	/** Closes every live read, telling each. */
	end(): void {
		const sends = [
			...[...this.#live.values()].map(({ send }) => send),
			...this.#computed.values(),
		]
		this.close()
		for (const send of sends) send({ kind: 'closed' })
	}

	/**
	 * `first` within what a live list of `model` follows: what a client reopens
	 * a list with that it grew to the limit and lost (D-252).
	 */
	capped(model: string, first: number): number {
		return Math.min(first, this.#limit(model))
	}

	async #follow(
		model: string,
		args: unknown,
		row: boolean,
		send: (message: LiveMessage) => void,
	): Promise<LiveHandle> {
		if (this.#closed) throw new Error('The viewer is closed.')
		const exposed = this.#settings.models.find(
			({ schema }) => schema.name === model,
		)
		if (!exposed?.used) throw invalid('model', `${model} is not live.`)
		this.#holds()
		const { first, where, totalCount, shape } = shapeOf(args, row)
		const caller = this.#caller
		const planned = await this.#readers.during(this, async () =>
			recording(async () => livePlan(model, liveArgs(args, row), caller, row)),
		)
		// What a closed viewer registers would stay in the index for good.
		if (this.#closed) throw new Error('The viewer is closed.')
		const limit = this.#limit(model)
		checked(this.#settings.models, model, planned.result, 'include')
		within(first, limit)
		this.#fits(first)
		const live = new Live(
			{
				model,
				queries: exposed.queries,
				where,
				shape,
				totalCount,
				row,
				limit,
				send,
				logger: this.#settings.logger,
				readers: this.#readers,
				owner: this,
			},
			caller,
			planned.result,
			first,
		)
		const { reads, expires } = planned
		const followed = { model, args, row, send, rows: first, reads, expires }
		this.#live.set(live, followed)
		this.#index()
		try {
			await live.start()
		} catch (error) {
			this.#live.delete(live)
			throw error
		}
		this.#reschedule()
		return {
			grow: async (more) => {
				if (!Number.isInteger(more) || more < 1) {
					throw invalid('first', 'first must be a positive integer.')
				}
				const rows = Math.min(followed.rows + more, limit)
				this.#fits(rows - followed.rows)
				followed.rows = rows
				return live.grow(more)
			},
			resend: async () => live.resend(),
			close: () => {
				live.close()
				this.#live.delete(live)
			},
		}
	}

	/** The rows a live list of `model` follows at most. */
	#limit(model: string): number {
		const exposed = this.#settings.models.find(
			({ schema }) => schema.name === model,
		)
		return exposed?.with?.maxLive ?? this.#settings.maxLive
	}

	/** Refuses one more live read past what the connection holds. */
	#holds(): void {
		const reads = this.#live.size + this.#computed.size
		holds(reads, this.#settings.maxSubscriptions)
	}

	/** Refuses `more` rows past what the connection follows in all. */
	#fits(more: number): void {
		let rows = more
		for (const subscription of this.#live.values()) rows += subscription.rows
		fits(rows, this.#settings.maxConnectionRows)
	}
}
