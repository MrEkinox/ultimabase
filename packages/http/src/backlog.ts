// What a client whose buffer is full is still sent (D-254): its changes, as long
// as they cost less than the whole window it would get instead.

/** The parts of a live message that say what it costs. */
type Costed = {
	readonly kind: string
	readonly rows?: readonly unknown[]
	readonly changes?: readonly unknown[]
}

/** What a live read sent since its client's buffer was last not full. */
export class Backlog {
	#shown = 0
	#cost = 0

	/** Whether `message` is sent, or dropped until the window comes again. */
	takes(full: boolean, message: Costed): boolean {
		if (!full) {
			this.#cost = 0
			if (message.rows !== undefined) this.#shown = message.rows.length
			return true
		}
		if (message.changes === undefined) return false
		this.#cost += message.changes.length + 1
		return this.#cost <= this.#shown
	}
}
