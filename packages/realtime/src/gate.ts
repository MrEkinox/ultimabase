// The openings of a process, a few at a time and in the order they came: the
// others wait without holding a database connection (D-277). They run in short
// turns of the event loop, those connected before those arriving (D-286).
import { paced } from './turns.ts'

/** How many open at once: what a flush allows, below the pool's default 10. */
export const opening = 8

/** How long a task holds its turn: one that hangs must not stop the others. */
const patience = 5000

/** The turn of the gate that goes to those arriving, whatever else waits. */
const arrivingTurn = 8

export class Gate {
	readonly #limit: number
	readonly #waiting: (() => void)[] = []
	readonly #arriving: (() => void)[] = []
	#running = 0
	#turns = 0

	constructor(limit: number) {
		this.#limit = limit
	}

	/** Runs `task` in its turn. */
	async run<T>(task: () => Promise<T>): Promise<T> {
		return this.#inTurn(task, this.#waiting)
	}

	/**
	 * Runs the task of a connection arriving, once those connected have opened
	 * what they asked: each has all it asked before the next begins.
	 */
	async arrive<T>(task: () => Promise<T>): Promise<T> {
		return this.#inTurn(task, this.#arriving)
	}

	#next(): (() => void) | undefined {
		this.#turns = (this.#turns + 1) % arrivingTurn
		return this.#turns === 0
			? (this.#arriving.shift() ?? this.#waiting.shift())
			: (this.#waiting.shift() ?? this.#arriving.shift())
	}

	async #inTurn<T>(task: () => Promise<T>, queue: (() => void)[]): Promise<T> {
		if (this.#running < this.#limit) this.#running += 1
		else {
			await new Promise<void>((resolve) => {
				queue.push(resolve)
			})
		}
		let held = true
		const release = () => {
			if (!held) return
			held = false
			const next = this.#next()
			if (next === undefined) this.#running -= 1
			else next()
		}
		const timer = setTimeout(release, patience)
		timer.unref()
		try {
			await paced()
			return await task()
		} finally {
			clearTimeout(timer)
			release()
		}
	}
}
