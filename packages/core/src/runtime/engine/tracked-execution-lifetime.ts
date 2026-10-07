/** Tracks asynchronous work while revoking new execution at one lifecycle boundary. */
export class TrackedExecutionLifetime {
	readonly #createClosedError: () => Error
	readonly #pendingOperations = new Set<Promise<void>>()
	#active = true
	#failure: unknown
	#hasFailure = false

	constructor(createClosedError: () => Error) {
		this.#createClosedError = createClosedError
	}

	/** Rejects capabilities retained after their owning callback has settled. */
	assertActive(): void {
		if (!this.#active) {
			throw this.#createClosedError()
		}
	}

	/** Tracks one started operation so unawaited failures remain observable. */
	run<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
		this.assertActive()

		let result: Promise<TResult>

		try {
			result = operation()
		} catch (error: unknown) {
			this.markFailed(error)
			throw error
		}

		const observation: Promise<void> = result.then(
			() => undefined,
			(error: unknown) => {
				this.markFailed(error)
			},
		)

		this.#pendingOperations.add(observation)
		void observation.finally(() => this.#pendingOperations.delete(observation))

		return result
	}

	/** Retains the first failure so catching it cannot make the owner look successful. */
	markFailed(error: unknown): void {
		if (!this.#hasFailure) {
			this.#failure = error
			this.#hasFailure = true
		}
	}

	/** Revokes new work, waits for admitted operations, and rethrows their first failure. */
	async close(): Promise<void> {
		this.#active = false
		await Promise.all([...this.#pendingOperations])

		if (this.#hasFailure) {
			throw this.#failure
		}
	}
}
