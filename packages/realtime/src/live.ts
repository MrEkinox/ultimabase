// A live list or row (D-154): its window follows each flush's changes, a
// row placed or removed at a time, and sends only what changed. Its tasks
// run one after another; one that fails reads the window again, and a
// second failure closes it.
import type { Caller, Logger, ModelQueries, Row } from 'ultimabase'
import type { LivePlan } from 'ultimabase/internal'
import { liveSchema, sortKeys, storedRows } from 'ultimabase/internal'
import type { Finder, Tracked } from './affected.ts'
import { affected } from './affected.ts'
import type { Batch } from './changes.ts'
import type { Reach } from './reach.ts'
import { reachOf } from './reach.ts'
import type { Loader } from './reads.ts'
import { finderOf, pass } from './reads.ts'
import type { LiveMessage } from './messages.ts'
import type { Entry } from './window.ts'
import { Window } from './window.ts'

export type Spec = {
	readonly model: string
	readonly queries: ModelQueries
	/** The read's own `where`, which `totalCount` counts. */
	readonly where: unknown
	/** Its `select`, `include` or `omit`, each level's `id` selected. */
	readonly shape: { readonly [key: string]: unknown }
	readonly totalCount: boolean
	readonly row: boolean
	readonly send: (message: LiveMessage) => void
	readonly logger: Logger
}

type Shown = { readonly [field: string]: unknown }

/** The rows `include` reached from `node`, as `[path, id]`. */
function reached(
	node: Shown,
	include: LivePlan['include'],
	path: string,
	out: (readonly [string, string])[],
): void {
	for (const [name, inner] of Object.entries(include ?? {})) {
		const at = path === '' ? name : `${path}.${name}`
		const value = node[name]
		const rows: readonly unknown[] = Array.isArray(value) ? value : [value]
		for (const row of rows) {
			if (typeof row !== 'object' || row === null) continue
			const id: unknown = Reflect.get(row, 'id')
			if (typeof id === 'string') out.push([at, id])
			reached(Object.fromEntries(Object.entries(row)), inner.include, at, out)
		}
	}
}

export class Live {
	caller: Caller
	#plan: LivePlan
	#reach: Reach
	#window: Window
	readonly #spec: Spec
	readonly #find: Finder
	readonly #tracked = new Map<string, Map<string, Set<string>>>()
	readonly #reaching = new Map<string, readonly (readonly [string, string])[]>()
	#count: number | undefined
	#hasMore = false
	#revision = 0
	#queue: Promise<void> = Promise.resolve()
	#closed = false

	constructor(spec: Spec, caller: Caller, plan: LivePlan, first: number) {
		this.#spec = spec
		this.caller = caller
		this.#plan = plan
		this.#reach = reachOf(liveSchema(), spec.model, plan)
		this.#window = new Window(plan.orderBy, first)
		this.#find = finderOf(spec.model)
	}

	get first(): number {
		return this.#window.first
	}

	/** Reads the window and sends it; a failure closes the read. */
	async start(): Promise<void> {
		const run = this.#reset()
		this.#queue = run.catch(() => undefined)
		try {
			await run
		} catch (error) {
			this.close()
			throw error
		}
	}

	/** Follows `batch`, or reads the window again when changes were missed. */
	async apply(batch: Batch, loader: Loader, missed: boolean): Promise<void> {
		const [, settled] = this.#enqueue(async () =>
			missed ? this.#reset() : this.#apply(batch, loader),
		)
		return settled
	}

	/** Takes the caller's new plan; a changed one reads the window again. */
	async replan(caller: Caller, plan: LivePlan): Promise<void> {
		const [, settled] = this.#enqueue(async () => {
			const same =
				JSON.stringify(plan) === JSON.stringify(this.#plan) &&
				JSON.stringify(caller) === JSON.stringify(this.caller)
			this.caller = caller
			if (same) return
			this.#plan = plan
			this.#reach = reachOf(liveSchema(), this.#spec.model, plan)
			await this.#reset()
		})
		return settled
	}

	/** Shows `more` rows after the last one. */
	async grow(more: number): Promise<void> {
		const [run] = this.#enqueue(async () => {
			const before = this.#window.shown()
			this.#window.first += more
			// Sent even when no row follows: the client waits for it.
			await this.#send(before, new Set(), new Set(), false, true)
		})
		return run
	}

	/** Reads the window again and sends it whole. */
	async resend(): Promise<void> {
		const [, settled] = this.#enqueue(async () => this.#reset())
		return settled
	}

	close(): void {
		this.#closed = true
		this.#tracked.clear()
		this.#reaching.clear()
	}

	#enqueue(task: () => Promise<void>): readonly [Promise<void>, Promise<void>] {
		const run = this.#queue.then(async () =>
			this.#closed ? undefined : task(),
		)
		const settled = run.catch(async (error: unknown) => this.#recover(error))
		this.#queue = settled
		return [run, settled]
	}

	async #recover(error: unknown): Promise<void> {
		const { logger, model, send } = this.#spec
		if (this.#closed) return
		logger.error(
			{ err: error },
			`A live read of ${model} failed: it reads again.`,
		)
		try {
			await this.#reset()
		} catch (again) {
			logger.error({ err: again }, `A live read of ${model} failed: it closes.`)
			this.close()
			send({ kind: 'closed' })
		}
	}

	#entry(row: Row): Entry {
		const keys = sortKeys(this.#spec.model, row, this.#plan.orderBy)
		return { id: row.id, keys }
	}

	/** The stored rows after the window's last, from `where` and in order. */
	async #after(take: number): Promise<readonly Row[]> {
		const { where, orderBy } = this.#plan
		const last = this.#window.entries.at(-1)
		return storedRows(this.#spec.model, {
			...(where && { where }),
			orderBy,
			...(last && { cursor: { id: { equals: last.id } }, skip: 1 }),
			take,
			fields: orderBy.map(({ field }) => field),
		})
	}

	async #refill(): Promise<void> {
		const missing = this.#window.missing()
		if (missing <= 0) return
		const rows = await this.#after(missing + 1)
		const entries = rows.slice(0, missing).map((row) => this.#entry(row))
		this.#window.fill(entries, rows.length > missing)
	}

	async #counted(): Promise<number> {
		const { queries, where } = this.#spec
		const args = where === undefined ? {} : { where }
		return queries.count(args, { as: this.caller })
	}

	#untrack(root: string): void {
		for (const [path, id] of this.#reaching.get(root) ?? []) {
			const roots = this.#tracked.get(path)?.get(id)
			roots?.delete(root)
			if (roots?.size === 0) this.#tracked.get(path)?.delete(id)
		}
		this.#reaching.delete(root)
	}

	#track(node: Row): void {
		const out: (readonly [string, string])[] = []
		reached(node, this.#plan.include, '', out)
		this.#untrack(node.id)
		this.#reaching.set(node.id, out)
		for (const [path, id] of out) {
			const ids = this.#tracked.get(path) ?? new Map<string, Set<string>>()
			this.#tracked.set(path, ids)
			const roots = ids.get(id) ?? new Set<string>()
			ids.set(id, roots)
			roots.add(node.id)
		}
	}

	/** Reads `ids` as the caller into `nodes`; returns those it cannot read. */
	async #read(
		ids: readonly string[],
		nodes: Map<string, Row>,
	): Promise<readonly string[]> {
		if (ids.length === 0) return []
		const { queries, shape } = this.#spec
		const args = { ...shape, where: { id: { in: ids } } }
		const found = await queries.findMany(args, { as: this.caller })
		for (const node of found) {
			nodes.set(node.id, node)
			this.#track(node)
		}
		return ids.filter((id) => !nodes.has(id))
	}

	/**
	 * Refills the window and reads the rows it places; a row the caller
	 * cannot read leaves it, `gone`.
	 */
	async #settle(
		before: readonly Entry[],
		again: ReadonlySet<string>,
		gone: Set<string>,
	): Promise<{
		readonly moves: ReturnType<Window['moves']>
		readonly nodes: ReadonlyMap<string, Row>
	}> {
		const nodes = new Map<string, Row>()
		for (let round = 0; round < 3; round += 1) {
			await this.#refill()
			const moves = this.#window.moves(before, again)
			const unread = moves.placed.flatMap(({ id }) =>
				nodes.has(id) ? [] : [id],
			)
			const missing = await this.#read(unread, nodes)
			if (missing.length === 0) return { moves, nodes }
			for (const id of missing) {
				this.#window.remove(id)
				gone.add(id)
			}
		}
		throw new Error('The rows the live plan finds are not readable.')
	}

	#next(): number {
		this.#revision += 1
		return this.#revision
	}

	async #reset(): Promise<void> {
		const { model, row, send, totalCount } = this.#spec
		const { where, orderBy } = this.#plan
		const { first } = this.#window
		this.#window = new Window(orderBy, first)
		this.#tracked.clear()
		this.#reaching.clear()
		const rows = await storedRows(model, {
			...(where && { where }),
			orderBy,
			take: first + 2,
			fields: orderBy.map(({ field }) => field),
		})
		const entries = rows.slice(0, first + 1).map((each) => this.#entry(each))
		this.#window.fill(entries, rows.length > first + 1)
		const { nodes } = await this.#settle([], new Set(), new Set())
		this.#count = totalCount ? await this.#counted() : undefined
		this.#hasMore = this.#window.hasMore()
		const shown = this.#window.shown().flatMap(({ id }) => nodes.get(id) ?? [])
		if (this.#closed) return
		if (row) {
			send({ kind: 'row', revision: this.#next(), row: shown[0] ?? null })
			return
		}
		send({
			kind: 'reset',
			revision: this.#next(),
			rows: shown,
			hasMore: this.#hasMore,
			...(this.#count !== undefined && { totalCount: this.#count }),
		})
	}

	async #apply(batch: Batch, loader: Loader): Promise<void> {
		const { model, totalCount } = this.#spec
		const window = this.#window
		const before = window.shown()
		const effect = await affected(
			{
				model,
				reach: this.#reach,
				window: window.ids(),
				tracked: this.#tracked satisfies Tracked,
				find: this.#find,
			},
			batch,
		)
		if (effect === 'resync') return this.#reset()
		const gone = new Set(effect.deleted)
		for (const id of effect.deleted) window.remove(id)
		const candidates = [...effect.candidates].filter((id) => !gone.has(id))
		if (candidates.length > 0) {
			const rows = await loader.load(model, candidates)
			const kept = await pass(model, rows, this.#plan.where)
			const inside = window.ids()
			const left = new Map(
				[...rows].filter(([id]) => inside.has(id) && !kept.has(id)),
			)
			const readable = await pass(model, left, this.#plan.rights)
			for (const id of candidates) {
				const row = rows.get(id)
				if (row !== undefined && kept.has(id)) window.place(this.#entry(row))
				else if (window.remove(id) && !readable.has(id)) gone.add(id)
			}
		}
		const recount =
			totalCount &&
			(candidates.length > 0 || effect.deleted.size > 0 || effect.beyond)
		await this.#send(before, effect.resend, gone, recount)
	}

	/** Sends how the rows shown as `before` changed, if they did or `always`. */
	async #send(
		before: readonly Entry[],
		again: ReadonlySet<string>,
		gone: Set<string>,
		recount: boolean,
		always = false,
	): Promise<void> {
		const { row, send } = this.#spec
		const { moves, nodes } = await this.#settle(before, again, gone)
		for (const id of moves.removed) this.#untrack(id)
		let totalCount: number | undefined
		if (recount) {
			const count = await this.#counted()
			if (count !== this.#count) totalCount = count
			this.#count = count
		}
		if (this.#closed) return
		if (row) {
			if (moves.removed.length + moves.placed.length === 0) return
			const [entry] = this.#window.shown()
			const shown = entry === undefined ? null : (nodes.get(entry.id) ?? null)
			send({ kind: 'row', revision: this.#next(), row: shown })
			return
		}
		const changes = [
			...moves.removed.map((id) => ({ remove: id, gone: gone.has(id) })),
			...moves.placed.flatMap(({ id, after }) => {
				const node = nodes.get(id)
				return node === undefined ? [] : [{ upsert: node, after }]
			}),
		]
		const hasMore = this.#window.hasMore()
		const more = hasMore !== this.#hasMore
		this.#hasMore = hasMore
		if (changes.length === 0 && !more && totalCount === undefined && !always) {
			return
		}
		send({
			kind: 'changes',
			revision: this.#next(),
			changes,
			...(more && { hasMore }),
			...(totalCount !== undefined && { totalCount }),
		})
	}
}
