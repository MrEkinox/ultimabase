// A live read's tasks, one after another: a flush waits for them, unless one
// is a big read (D-254), and a read with none costs a flush nothing (D-255).

/** What a flush waits for, nothing when it has nothing to do. */
export type Waited = Promise<void> | undefined

export class Tasks {
	#queue: Promise<void> = Promise.resolve()
	/** The tasks it is running or has queued. */
	#busy = 0
	/** The reads of the whole window it is running or has queued. */
	#rereads = 0

	get resting(): boolean {
		return this.#busy === 0
	}

	get rereading(): boolean {
		return this.#rereads > 0
	}

	/** Runs the first read at once: its failure is its caller's. */
	first(read: () => Promise<void>): Promise<void> {
		this.#rereads += 1
		this.#busy += 1
		const run = read().finally(() => {
			this.#rereads -= 1
			this.#busy -= 1
		})
		this.#queue = run.catch(() => undefined)
		return run
	}

	/**
	 * Queues `task`, `recover` taking its failure; no async wrapper, as each
	 * flush queues one per read. Returns its run, and once it recovered.
	 */
	add(
		task: () => Promise<void> | undefined,
		recover: (error: unknown) => Promise<void>,
	): readonly [Promise<void>, Promise<void>] {
		this.#busy += 1
		const run = this.#queue.then(task)
		const settled = run.catch(recover).finally(() => {
			this.#busy -= 1
		})
		this.#queue = settled
		return [run, settled]
	}

	/** Queues a read of the whole window, as `add` does. */
	async reread(
		read: () => Promise<void> | undefined,
		recover: (error: unknown) => Promise<void>,
	): Promise<void> {
		this.#rereads += 1
		const [, settled] = this.add(read, recover)
		return settled.finally(() => {
			this.#rereads -= 1
		})
	}
}
