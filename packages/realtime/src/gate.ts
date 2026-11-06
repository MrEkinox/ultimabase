// The openings of a process, a few at a time and in the order they came: the
// others wait without holding a database connection (D-277).

/** How many open at once: what a flush allows, below the pool's default 10. */
export const opening = 8

/** How long a task holds its turn: one that hangs must not stop the others. */
const patience = 5000

export class Gate {
	readonly #limit: number
	readonly #waiting: (() => void)[] = []
	#running = 0

	constructor(limit: number) {
		this.#limit = limit
	}

	/** Runs `task` in its turn. */
	async run<T>(task: () => Promise<T>): Promise<T> {
		if (this.#running < this.#limit) this.#running += 1
		else {
			await new Promise<void>((resolve) => {
				this.#waiting.push(resolve)
			})
		}
		let held = true
		const release = () => {
			if (!held) return
			held = false
			const next = this.#waiting.shift()
			if (next === undefined) this.#running -= 1
			else next()
		}
		const timer = setTimeout(release, patience)
		timer.unref()
		try {
			return await task()
		} finally {
			clearTimeout(timer)
			release()
		}
	}
}
