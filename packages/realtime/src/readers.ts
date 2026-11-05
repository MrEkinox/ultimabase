// The live reads a write can concern (D-256): the reads of one shape share what
// a flush asks of them, so a write visits those it leads to, not all of them.
import type { LivePlan, Recorded } from 'ultimabase/internal'
import { liveSchema } from 'ultimabase/internal'
import type { Batch } from './changes.ts'
import { wrote } from './changes.ts'
import type { Reach } from './reach.ts'
import { modelsOf, reachOf } from './reach.ts'
import type { Loader } from './reads.ts'
import type { Interest, Shape } from './routes.ts'
import { concernOf, interestOfPlan, interestOfRead, shapeOf } from './routes.ts'

/** The reads a flush visits: some of an owner's, or all of them. */
export type Concerned = ReadonlySet<object> | 'all'

/** Whoever holds live reads and follows a flush for them: a viewer. */
export interface Owner {
	flush(batch: Batch, loader: Loader, concerned: Concerned): Promise<void>
	end(): void
}

type Entry = {
	readonly reader: object
	readonly owner: Owner
	within: readonly Membership[]
}

type Membership = { readonly shape: Held; readonly ids: readonly string[] }

type Held = Shape & { readonly readers: Map<string, Set<Entry>> }

/** Where a read that pins nothing is held: it is visited with the shape. */
const anyone = ''

export class Readers {
	readonly #shapes = new Map<string, Held>()
	readonly #entries = new Map<object, Entry>()
	readonly #busy = new Map<object, number>()
	readonly #always = new Set<object>()

	/** Follows `plan`, a live read of `spec.model`; returns where it reaches. */
	followPlan(
		spec: { readonly owner: Owner; readonly model: string },
		reader: object,
		plan: LivePlan,
	): Reach {
		const schema = liveSchema()
		const reach = reachOf(schema, spec.model, plan)
		const interest = interestOfPlan(modelsOf(schema), spec.model, plan, reach)
		this.#follow(spec.owner, reader, [interest])
		return reach
	}

	/** Follows what `reader` read to build a caller, a plan or a result. */
	followReads(owner: Owner, reader: object, reads: readonly Recorded[]): void {
		const models = modelsOf(liveSchema())
		const interests = reads.map((read) => interestOfRead(models, read))
		this.#follow(owner, reader, interests)
	}

	#follow(owner: Owner, reader: object, interests: readonly Interest[]): void {
		this.#leave(reader)
		const entry: Entry = { reader, owner, within: [] }
		entry.within = interests.map((interest) => {
			const made = shapeOf(interest)
			const shape = this.#shapes.get(made.key) ?? {
				...made,
				readers: new Map<string, Set<Entry>>(),
			}
			this.#shapes.set(made.key, shape)
			const ids = interest.pin?.ids ?? [anyone]
			for (const id of ids) {
				const held = shape.readers.get(id) ?? new Set()
				shape.readers.set(id, held.add(entry))
			}
			return { shape, ids }
		})
		this.#entries.set(reader, entry)
	}

	/** Forgets `reader`, closed, or about to follow something else. */
	forget(reader: object): void {
		this.#always.delete(reader)
		this.#leave(reader)
	}

	#leave(reader: object): void {
		const entry = this.#entries.get(reader)
		if (entry === undefined) return
		this.#entries.delete(reader)
		for (const { shape, ids } of entry.within) {
			for (const id of ids) {
				const held = shape.readers.get(id)
				held?.delete(entry)
				if (held?.size === 0) shape.readers.delete(id)
			}
			if (shape.readers.size === 0 && this.#shapes.get(shape.key) === shape) {
				this.#shapes.delete(shape.key)
			}
		}
	}

	/** While `on`, a flush visits `reader`: a task of it may not read its write. */
	busy(reader: object, on: boolean): void {
		const left = (this.#busy.get(reader) ?? 0) + (on ? 1 : -1)
		if (left > 0) this.#busy.set(reader, left)
		else this.#busy.delete(reader)
	}

	/** Runs `task`, `reader` being busy until it ends. */
	async during<T>(reader: object, task: () => Promise<T>): Promise<T> {
		this.busy(reader, true)
		return task().finally(() => {
			this.busy(reader, false)
		})
	}

	/** While `on`, a flush visits `reader`, whatever it wrote. */
	always(reader: object, on: boolean): void {
		if (on) this.#always.add(reader)
		else this.#always.delete(reader)
	}

	/** The reads `batch` may concern, by owner. */
	async concerned(
		batch: Batch,
		loader: Loader,
	): Promise<ReadonlyMap<Owner, ReadonlySet<object>>> {
		const found = new Map<Owner, Set<object>>()
		const add = ({ owner, reader }: Entry): void => {
			const known = found.get(owner)
			if (known === undefined) found.set(owner, new Set([reader]))
			else known.add(reader)
		}
		// Before any wait: a task started after this reads the write.
		for (const reader of [...this.#busy.keys(), ...this.#always]) {
			const entry = this.#entries.get(reader)
			if (entry !== undefined) add(entry)
		}
		const shapes = [...this.#shapes.values()].filter(({ models }) =>
			wrote(batch, models),
		)
		const answers = await Promise.all(
			shapes.map((shape) =>
				// A failed read must not stop the flush: each read recovers its own.
				concernOf(shape, batch, loader).catch(() => 'all' as const),
			),
		)
		for (const [at, shape] of shapes.entries()) {
			const pins = answers[at] ?? 'all'
			for (const pin of pins === 'all' ? shape.readers.keys() : pins) {
				for (const entry of shape.readers.get(pin) ?? []) add(entry)
			}
		}
		return found
	}
}
