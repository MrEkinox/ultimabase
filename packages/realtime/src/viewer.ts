// A viewer (D-154): one connection's caller and its live reads. The reads
// that built the caller and planned each live read are kept; a write that
// may change one rebuilds the caller, which resyncs the reads whose plan
// changed and closes them all when it is no longer the same user. A caller
// that stops holding at a time is built again then.
import type { Caller, ExposedModel, Logger } from 'ultimabase'
import { PublicError } from 'ultimabase'
import type { LivePlan, Recorded } from 'ultimabase/internal'
import {
	inMemory,
	livePlan,
	liveSchema,
	matches,
	recording,
} from 'ultimabase/internal'
import type { Batch } from './changes.ts'
import { listed, touched, unlisted } from './changes.ts'
import type { LiveMessage } from './messages.ts'
import { Live } from './live.ts'
import { modelsOf, stepOf, walk } from './reach.ts'
import type { Level } from './reach.ts'
import type { Loader } from './reads.ts'
import { liveArgs, shapeOf } from './shape.ts'

export type Settings = {
	readonly models: readonly ExposedModel<{ readonly maxLive?: number }>[]
	readonly maxLive: number
	readonly identify: (request: Request) => Promise<Caller>
	readonly logger: Logger
}

/** A live read's handle. */
export interface LiveHandle {
	/** Shows `more` rows after the last; a list over its limit is refused. */
	grow(this: void, more: number): Promise<void>
	close(this: void): void
}

type Subscription = {
	readonly model: string
	readonly args: unknown
	readonly row: boolean
	readonly send: (message: LiveMessage) => void
	reads: readonly Recorded[]
	expires: Date | undefined
}

type Built<R> = Awaited<ReturnType<typeof recording<R>>>

/** The least wait before a rebuild, so a past expiry is no hot loop. */
const soonest = 1000
/** The longest wait `setTimeout` keeps. */
const latest = 2 ** 31 - 1

const invalid = (path: string, message: string): PublicError =>
	new PublicError('VALIDATION_FAILED', message, {
		details: { issues: [{ path: [path], message }] },
	})

/** Who `caller` is, which a rebuilt caller must keep. */
const whoOf = (caller: Caller): string => {
	if (caller.kind !== 'user') return JSON.stringify(caller)
	const id: unknown = Reflect.get(caller.user, 'id')
	return JSON.stringify(['user', id])
}

/** Whether a write in `batch` may change what `read` found. */
async function stale(
	read: Recorded,
	batch: Batch,
	loader: Loader,
): Promise<boolean> {
	const models = modelsOf(liveSchema())
	if (read.relation !== undefined) {
		const [model = '', field = ''] = read.relation.split('.')
		const step = stepOf(models, model, field)
		if (touched(batch.get(model), new Set([field]))) return true
		if (step && touched(batch.get(step.target), new Set([step.inverse]))) {
			return true
		}
	}
	const { model, where, ids } = read
	if (where !== undefined && !inMemory(model, where)) {
		const levels: Level[] = []
		walk(models, model, where, [], false, levels)
		return levels.some((level) => batch.has(level.model))
	}
	const changes = batch.get(model)
	if (changes === undefined) return false
	if (unlisted(changes) || ids === undefined) return true
	const found = new Set(ids)
	const written = [...listed(changes.updates), ...listed(changes.deletes)]
	if (written.some((id) => found.has(id))) return true
	const inserted = listed(changes.inserts)
	if (where === undefined) return inserted.length > 0
	const others = [...inserted, ...listed(changes.updates)]
	const rows = await loader.load(model, others)
	return [...rows.values()].some((row) => matches(model, row, where))
}

const anyStale = async (
	reads: readonly Recorded[],
	batch: Batch,
	loader: Loader,
): Promise<boolean> => {
	for (const read of reads) if (await stale(read, batch, loader)) return true
	return false
}

export class Viewer {
	readonly #settings: Settings
	readonly #request: Request
	readonly #onClose: () => void
	readonly #onDue: () => void
	readonly #live = new Map<Live, Subscription>()
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
		this.#onClose = hooks.onClose
		this.#onDue = hooks.onDue
		this.#reschedule()
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

	close(): void {
		if (this.#closed) return
		this.#closed = true
		clearTimeout(this.#due)
		for (const live of this.#live.keys()) live.close()
		this.#live.clear()
		this.#onClose()
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
		const lives = [...this.#live.keys()]
		await Promise.all(
			lives.map(async (live) => live.apply(batch, loader, missed)),
		)
	}

	/** Builds the caller again, then each live read's plan. */
	async rebuild(): Promise<void> {
		if (this.#closed) return
		let identified: Built<Caller>
		try {
			identified = await recording(async () =>
				this.#settings.identify(this.#request),
			)
		} catch {
			return this.end()
		}
		const caller = identified.result
		if (whoOf(caller) !== whoOf(this.#caller)) return this.end()
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
		this.#reschedule()
	}

	/** Waits for the earliest time the caller or a live read stops holding. */
	#reschedule(): void {
		clearTimeout(this.#due)
		this.#due = undefined
		if (this.#closed) return
		const subscriptions = [...this.#live.values()]
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
		const sends = [...this.#live.values()].map(({ send }) => send)
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
		const { first, where, totalCount, shape } = shapeOf(args, row)
		const caller = this.#caller
		const planned = await recording(async () =>
			livePlan(model, liveArgs(args, row), caller, row),
		)
		const limit = exposed.with?.maxLive ?? this.#settings.maxLive
		const nested = this.#checked(model, planned.result, 'include')
		if (first * (1 + nested) > limit) {
			throw invalid(
				'first',
				`first is over ${limit}, the most a live list follows.`,
			)
		}
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
		this.#live.set(live, { model, args, row, send, reads, expires })
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
				return live.grow(more)
			},
			close: () => {
				live.close()
				this.#live.delete(live)
			},
		}
	}

	/**
	 * Refuses an order that reads another row and a selection that reaches a
	 * model which is not live; returns the nested rows each root row follows.
	 */
	#checked(
		model: string,
		plan: Omit<LivePlan, 'where' | 'rights'>,
		path: string,
	): number {
		for (const order of plan.orderBy) {
			if (order.through ?? order.count ?? order.relevance) {
				throw invalid(
					'orderBy',
					`A live list sorts by ${model}'s own fields: ${order.field} reads another row.`,
				)
			}
		}
		const models = modelsOf(liveSchema())
		const live = (target: string, at: string): void => {
			const used = this.#settings.models.find(
				({ schema }) => schema.name === target,
			)
			if (!used?.used) throw invalid(at, `${target} is not live.`)
		}
		let rows = 0
		for (const [name, inner] of Object.entries(plan.include ?? {})) {
			const step = stepOf(models, model, name)
			if (step === undefined) continue
			const at = `${path}.${name}`
			live(step.target, at)
			const below = this.#checked(step.target, { ...inner, orderBy: [] }, at)
			if (!step.many) {
				rows += below
				continue
			}
			if (inner.take === undefined) {
				throw invalid(at, `A live ${name} list needs a take.`)
			}
			rows += Math.abs(inner.take) * (1 + below)
		}
		for (const name of Object.keys(plan.count ?? {})) {
			const step = stepOf(models, model, name)
			if (step !== undefined) live(step.target, `${path}._count.${name}`)
		}
		return rows
	}
}
