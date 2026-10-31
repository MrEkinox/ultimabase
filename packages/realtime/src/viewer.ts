// A viewer (D-154): one connection's caller and its live reads. The reads
// that built the caller and planned each live read are kept; a write that
// may change one rebuilds the caller, which resyncs the reads whose plan
// changed and closes them all when it is no longer the same user. A caller
// that stops holding at a time is built again then. A live function runs
// again as the rebuilt caller.
import type { Caller, ExposedFunction, ExposedModel, Logger } from 'ultimabase'
import type { Recorded } from 'ultimabase/internal'
import { livePlan, recording } from 'ultimabase/internal'
import type { Batch } from './changes.ts'
import { checked, invalid } from './checked.ts'
import { Computed, debounce, ownerOf } from './computed.ts'
import type { LiveHandle, LiveMessage } from './messages.ts'
import { Live } from './live.ts'
import type { Loader } from './reads.ts'
import { liveArgs, shapeOf } from './shape.ts'
import { anyStale } from './stale.ts'

export type Settings = {
	readonly models: readonly ExposedModel<{ readonly maxLive?: number }>[]
	readonly functions: readonly ExposedFunction<{ readonly debounce?: number }>[]
	readonly maxLive: number
	readonly maxSubscriptions: number
	readonly maxConnectionRows: number
	readonly identify: (request: Request) => Promise<Caller>
	readonly logger: Logger
}

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

/** The least wait before a rebuild, so a past expiry is no hot loop. */
const soonest = 1000
/** The longest wait `setTimeout` keeps. */
const latest = 2 ** 31 - 1

/** Who `caller` is, which a rebuilt caller must keep. */
const whoOf = (caller: Caller): string => {
	if (caller.kind !== 'user') return JSON.stringify(caller)
	const id: unknown = Reflect.get(caller.user, 'id')
	return JSON.stringify(['user', id])
}

export class Viewer {
	readonly #settings: Settings
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
		hooks: { readonly onClose: () => void; readonly onDue: () => void },
	) {
		this.#settings = settings
		this.#request = request
		this.#caller = identified.result
		this.#reads = identified.reads
		this.#expires = identified.expires
		this.#listeners.push(hooks.onClose)
		this.#onDue = hooks.onDue
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
			},
			this.#caller,
		)
		this.#computed.set(computed, send)
		try {
			await computed.start()
		} catch (error) {
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
		this.#told()
	}

	/** Runs `listener` once it closes, at once when it is closed (D-163). */
	onClose(listener: () => void): void {
		this.#listeners.push(listener)
		if (this.#closed) this.#told()
	}

	/** Runs each listener once; one that throws is logged, not the others. */
	#told(): void {
		for (const listener of this.#listeners.splice(0)) {
			try {
				listener()
			} catch (error) {
				this.#settings.logger.error({ err: error }, 'A close listener failed.')
			}
		}
	}

	/** Follows `batch`: rebuilds the caller first when a write may change it. */
	async flush(batch: Batch, loader: Loader, missed: boolean): Promise<void> {
		if (this.#closed) return
		const reads = [
			...this.#reads,
			...[...this.#live.values()].flatMap((subscription) => subscription.reads),
		]
		if (missed || (await anyStale(reads, batch, loader))) {
			await this.rebuild()
		}
		const lives = [...this.#live.keys(), ...this.#computed.keys()]
		await Promise.all(
			lives.map(async (live) => live.apply(batch, loader, missed)),
		)
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
		const times = [
			this.#expires,
			...subscriptions.map(({ expires }) => expires),
		]
			.filter((at) => at !== undefined)
			.map((at) => at.getTime())
		if (times.length === 0) return
		const wait = Math.min(
			Math.max(Math.min(...times) - Date.now(), soonest),
			latest,
		)
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
		const planned = await recording(async () =>
			livePlan(model, liveArgs(args, row), caller, row),
		)
		const limit = exposed.with?.maxLive ?? this.#settings.maxLive
		const nested = checked(
			this.#settings.models,
			model,
			planned.result,
			'include',
		)
		if (first * (1 + nested) > limit) {
			throw invalid(
				'first',
				`first is over ${limit}, the most a live list follows.`,
			)
		}
		this.#fits(first * (1 + nested))
		const live = new Live(
			{
				model,
				queries: exposed.queries,
				where,
				shape,
				totalCount,
				row,
				send,
				logger: this.#settings.logger,
			},
			caller,
			planned.result,
			first,
		)
		const { reads, expires } = planned
		const rows = first * (1 + nested)
		const subscription = { model, args, row, send, rows, reads, expires }
		this.#live.set(live, subscription)
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
				if ((live.first + more) * (1 + nested) > limit) {
					throw invalid(
						'first',
						`first is over ${limit}, the most a live list follows.`,
					)
				}
				const grown = (live.first + more) * (1 + nested)
				this.#fits(grown - subscription.rows)
				subscription.rows = grown
				return live.grow(more)
			},
			resend: async () => live.resend(),
			close: () => {
				live.close()
				this.#live.delete(live)
			},
		}
	}

	/** Refuses one more live read past what the connection holds. */
	#holds(): void {
		const { maxSubscriptions } = this.#settings
		if (this.#live.size + this.#computed.size < maxSubscriptions) return
		throw invalid(
			'subscriptions',
			`A connection holds at most ${maxSubscriptions} live reads.`,
		)
	}

	/** Refuses `more` rows past what the connection follows in all. */
	#fits(more: number): void {
		const { maxConnectionRows } = this.#settings
		let rows = more
		for (const subscription of this.#live.values()) rows += subscription.rows
		if (rows <= maxConnectionRows) return
		throw invalid(
			'first',
			`A connection follows at most ${maxConnectionRows} rows.`,
		)
	}
}
