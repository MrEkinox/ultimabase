// A live list or row (D-154): its window follows each flush's changes, a
// row placed or removed at a time, and sends only what changed. Its tasks
// run one after another; one that fails reads the window again, and a
// second failure closes it.
import type { Caller, Row } from 'ultimabase'
import type { LivePlan, LiveReader } from 'ultimabase/internal'
import {
	liveReader,
	liveSchema,
	recordingVirtuals,
	sortKeys,
	storedRows,
} from 'ultimabase/internal'
import { affected } from './affected.ts'
import type { Batch } from './changes.ts'
import { wrote } from './changes.ts'
import { passing } from './levels.ts'
import type { Reach } from './reach.ts'
import { modelsOf } from './reach.ts'
import { finderOf, judgeOf, Loader, pass, rowsAfter } from './reads.ts'
import type { Spec } from './messages.ts'
import type { Waited } from './tasks.ts'
import { Tasks } from './tasks.ts'
import { bigRead, inParts, inTurn } from './turns.ts'
import type { Keys } from './window.ts'
import { Window } from './window.ts'
import { VirtualReads } from './virtuals.ts'

export class Live {
	caller: Caller
	#plan: LivePlan
	/** Its rows' read, planned once for the caller and the plan (D-195). */
	#reader: LiveReader | undefined
	#reach: Reach
	#window: Window
	readonly #spec: Spec
	readonly #virtuals = new VirtualReads()
	#count: number | undefined
	#hasMore = false
	#revision = 0
	readonly #tasks: Tasks
	#closed = false

	constructor(spec: Spec, caller: Caller, plan: LivePlan, first: number) {
		this.#spec = spec
		this.caller = caller
		this.#plan = plan
		this.#tasks = new Tasks(spec.readers, this)
		this.#reach = spec.readers.followPlan(spec, this, plan)
		this.#window = new Window(plan.orderBy, first)
	}

	/** Reads the window and sends it; a failure closes the read. */
	async start(): Promise<void> {
		try {
			await this.#tasks.first(async () => this.#reset())
		} catch (error) {
			this.close()
			throw error
		}
	}

	/**
	 * Follows `batch`, or reads the window again when changes were missed. A
	 * write out of its reach costs nothing, unless a task may yet read it.
	 */
	apply(batch: Batch, loader: Loader, missed: boolean): Waited {
		if (missed) return this.#waited(this.#reread())
		if (
			this.#tasks.resting &&
			!wrote(batch, this.#reach.models) &&
			!this.#virtuals.mayChange(batch)
		) {
			return undefined
		}
		const [, settled] = this.#enqueue(() => this.#apply(batch, loader))
		return this.#waited(settled)
	}

	/** Takes the caller's new plan; a changed one reads the window again. */
	async replan(caller: Caller, plan: LivePlan): Promise<void> {
		const [, settled] = this.#enqueue(async () => {
			const same =
				JSON.stringify(plan) === JSON.stringify(this.#plan) &&
				JSON.stringify(caller) === JSON.stringify(this.caller)
			this.caller = caller
			this.#reader = undefined
			if (same) return
			this.#plan = plan
			this.#reach = this.#spec.readers.followPlan(this.#spec, this, plan)
			await this.#again()
		})
		return this.#waited(settled)
	}

	/** Shows `more` rows after the last one. */
	async grow(more: number): Promise<void> {
		const [run] = this.#enqueue(async () => {
			this.#window.mark()
			const { first } = this.#window
			this.#window.first = Math.min(first + more, this.#spec.limit)
			// Sent even when no row follows: the client waits for it.
			await this.#send(new Set(), new Set(), false, true)
		})
		return run
	}

	/** Rows follow the window, and it may still reach them. */
	#hasNext(): boolean {
		return this.#window.first < this.#spec.limit && this.#window.hasMore()
	}

	/** Reads the window again and sends it whole. */
	async resend(): Promise<void> {
		return this.#reread()
	}

	close(): void {
		this.#closed = true
		this.#virtuals.clear()
		this.#spec.readers.forget(this)
	}

	/** Queues a read of the whole window. */
	async #reread(): Promise<void> {
		return this.#tasks.reread(
			() => (this.#closed ? undefined : this.#reset()),
			async (error) => this.#recover(error),
		)
	}

	/** Reads the window from a task: a big read queues, for no flush to wait. */
	async #again(): Promise<void> {
		if (this.#window.first < bigRead) return this.#reset()
		void this.#reread()
	}

	/** What a flush waits for: `settled`, but no big read (D-254). */
	#waited(settled: Promise<void>): Waited {
		const big = this.#tasks.rereading && this.#window.first >= bigRead
		return big ? undefined : settled
	}

	#enqueue(task: () => Promise<void>): readonly [Promise<void>, Promise<void>] {
		return this.#tasks.add(
			() => (this.#closed ? undefined : task()),
			async (error) => this.#recover(error),
		)
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

	#entry(row: Row): Keys {
		// With the slot of the hash: an array grown later takes 160 bytes more.
		return sortKeys(this.#spec.model, row, this.#plan.orderBy).concat(undefined)
	}

	async #refill(loader?: Loader): Promise<void> {
		const missing = this.#window.missing()
		if (missing <= 0) return
		const { model } = this.#spec
		const last = this.#window.last()
		const rows = await rowsAfter(model, this.#plan, last, missing + 1, loader)
		const entries = rows.slice(0, missing).map((row) => this.#entry(row))
		this.#window.fill(entries, rows.length > missing)
	}

	async #counted(): Promise<number> {
		const { queries, where } = this.#spec
		const args = where === undefined ? {} : { where }
		return queries.count(args, { as: this.caller })
	}

	/**
	 * Reads `ids` as the caller into `nodes`, from the rows the flush loaded
	 * if any; returns those it cannot read.
	 */
	async #read(
		ids: readonly string[],
		nodes: Map<string, Row>,
		loader?: Loader,
	): Promise<readonly string[]> {
		if (ids.length === 0) return []
		const { model, shape } = this.#spec
		const rows = loader && (await loader.load(model, ids))
		const shared = loader?.reads
		const judge = rows && shared && judgeOf(model, rows, loader)
		this.#reader ??= await liveReader(model, shape, this.caller)
		const reader = this.#reader
		const { result: found, reads } = await recordingVirtuals(() =>
			inParts(ids, (part) => reader(part, rows, shared, judge)),
		)
		this.#virtuals.keep(found, reads)
		this.#spec.readers.always(this, !this.#closed && this.#virtuals.holding)
		for (const node of found) nodes.set(node.id, node)
		return ids.filter((id) => !nodes.has(id))
	}

	/**
	 * Refills the window and reads the rows it places; a row the caller
	 * cannot read leaves it, `gone`.
	 */
	async #settle(
		again: ReadonlySet<string>,
		gone: Set<string>,
		loader?: Loader,
	): Promise<{
		readonly moves: ReturnType<Window['moves']>
		readonly nodes: ReadonlyMap<string, Row>
	}> {
		const nodes = this.#virtuals.taken()
		for (let round = 0; round < 3; round += 1) {
			await this.#refill(loader)
			const moves = this.#window.moves(again)
			const unread = moves.placed.flatMap(({ id }) =>
				nodes.has(id) ? [] : [id],
			)
			const missing = await this.#read(unread, nodes, loader)
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
		return inTurn(this.#window.first, async () =>
			this.#closed ? undefined : this.#readWhole(),
		)
	}

	async #readWhole(): Promise<void> {
		const { model, row, send, totalCount } = this.#spec
		const { where, orderBy } = this.#plan
		const { first } = this.#window
		this.#window = new Window(orderBy, first)
		this.#virtuals.clear()
		// One query, of the fields that place and show a row, given to the reader.
		const { placing: place, showing: show } = this.#reach
		const rows = await storedRows(model, {
			...(where && { where }),
			orderBy,
			take: first + 2,
			...(place !== 'all' && show !== 'all' && { fields: [...place, ...show] }),
		})
		const loader = new Loader()
		loader.keep(model, rows)
		const entries = rows.slice(0, first + 1).map((each) => this.#entry(each))
		this.#window.fill(entries, rows.length > first + 1)
		const { nodes } = await this.#settle(new Set(), new Set(), loader)
		this.#count = totalCount ? await this.#counted() : undefined
		this.#hasMore = this.#hasNext()
		this.#window.endsMoved()
		const shown = this.#window.shown().flatMap((id) => nodes.get(id) ?? [])
		for (const node of shown) this.#window.sent(node.id, node)
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
		const effect = await affected(
			{
				model,
				reach: this.#reach,
				window: window.ids(),
				find: finderOf(model, loader),
				judge: async (level, changes, ids) =>
					passing(modelsOf(liveSchema()), level, changes, ids, loader),
			},
			batch,
		)
		if (effect === 'resync') return this.#again()
		// A row whose virtuals now read differently is sent again.
		const again = await this.#virtuals.changed(batch, loader, async (ids) => {
			const nodes = new Map<string, Row>()
			await this.#read(ids, nodes, loader)
			return nodes
		})
		const resend = new Set([...effect.resend, ...again])
		const gone = new Set(effect.deleted)
		const candidates = [...effect.candidates].filter((id) => !gone.has(id))
		const rows = await loader.load(model, candidates)
		const kept = await pass(model, rows, this.#plan.where, loader)
		const inside = window.ids()
		const leaving = candidates.filter((id) => inside.has(id) && !kept.has(id))
		const left = new Map(
			leaving.flatMap((id) => rows.get(id) ?? []).map((row) => [row.id, row]),
		)
		const readable = await pass(model, left, this.#plan.rights, loader)
		const recount =
			totalCount &&
			(candidates.length > 0 || effect.deleted.size > 0 || effect.beyond)
		// A write that leaves the window as it was costs no pass over it.
		const touched =
			gone.size > 0 || resend.size > 0 || kept.size > 0 || leaving.length > 0
		if (!touched && !recount) return
		window.mark()
		for (const id of effect.deleted) window.remove(id)
		for (const id of leaving) {
			window.remove(id)
			if (!readable.has(id)) gone.add(id)
		}
		for (const id of kept) {
			const row = rows.get(id)
			if (row !== undefined) window.place(this.#entry(row))
		}
		await this.#send(resend, gone, recount, false, loader)
	}

	/** Sends how the rows shown at the mark changed, if they did or `always`. */
	async #send(
		again: ReadonlySet<string>,
		gone: Set<string>,
		recount: boolean,
		always = false,
		loader?: Loader,
	): Promise<void> {
		const { row, send } = this.#spec
		const { moves, nodes } = await this.#settle(again, gone, loader)
		for (const id of moves.removed) this.#virtuals.forget(id)
		let totalCount: number | undefined
		if (recount) {
			const { model } = this.#spec
			const count = await (loader === undefined
				? this.#counted()
				: loader.counted(model, this.#plan.where, async () => this.#counted()))
			if (count !== this.#count) totalCount = count
			this.#count = count
		}
		// A row read again as it was sent, and in its place, is not sent (D-252).
		const placed = moves.placed.flatMap(({ id, after, moved }) => {
			const node = nodes.get(id)
			if (node === undefined) return []
			return this.#window.sent(id, node) || moved
				? [{ upsert: node, after }]
				: []
		})
		if (this.#closed) return
		if (row) {
			if (moves.removed.length + placed.length === 0) return
			const [id] = this.#window.shown()
			const shown = id === undefined ? null : (nodes.get(id) ?? null)
			send({ kind: 'row', revision: this.#next(), row: shown })
			return
		}
		const changes = [
			...moves.removed.map((id) => ({ remove: id, gone: gone.has(id) })),
			...placed,
		]
		const hasMore = this.#hasNext()
		const more = hasMore !== this.#hasMore
		this.#hasMore = hasMore
		if (changes.length === 0 && !more && totalCount === undefined && !always) {
			return
		}
		const ends = this.#window.endsMoved()
		send({
			kind: 'changes',
			revision: this.#next(),
			changes,
			...(more && { hasMore }),
			...(totalCount !== undefined && { totalCount }),
			...(ends && { ends }),
		})
	}
}
