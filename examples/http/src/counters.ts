import type { HttpRateLimitStore } from '@ultimabase/http-plugin'

/**
 * Stands in for a Redis client: the two commands a shared counter needs.
 * Replace it with your Redis client so every process of the application
 * counts against the same limits; the tests read and break it.
 */
export class CounterClient {
	readonly #counts = new Map<string, { value: number; expiresAt: number }>()

	/** Adds one to `key` and returns the new value, like Redis `INCR`. */
	incr(key: string): Promise<number> {
		const current = this.#counts.get(key)
		const live =
			current !== undefined && current.expiresAt > Date.now()
				? current
				: undefined
		const next = {
			value: (live?.value ?? 0) + 1,
			expiresAt: live?.expiresAt ?? Number.POSITIVE_INFINITY,
		}
		this.#counts.set(key, next)
		return Promise.resolve(next.value)
	}

	/** Forgets `key` at `at` (epoch milliseconds), like Redis `PEXPIREAT`. */
	pexpireat(key: string, at: number): Promise<void> {
		const current = this.#counts.get(key)
		if (current !== undefined) current.expiresAt = at
		return Promise.resolve()
	}
}

export const redis = new CounterClient()

//#region store
/** Counts requests in Redis: every process shares the same limits. */
export const store: HttpRateLimitStore = {
	increment: async (key, expiresAt) => {
		const count = await redis.incr(key)
		await redis.pexpireat(key, expiresAt)
		return count
	},
}
//#endregion store
