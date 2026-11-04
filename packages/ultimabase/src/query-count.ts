// The reads that answer how many rows the caller reads, or whether one:
// `count`, and `exists` for server code only (D-244).
import type { QueryOptions, Where } from './query.ts'

export interface CountQueries<F> {
	count(
		this: void,
		args?: { readonly where?: Where<F> },
		options?: QueryOptions,
	): Promise<number>
	/** Whether `count` would find a row; server code only (D-244). */
	exists(
		this: void,
		args?: { readonly where?: Where<F> },
		options?: QueryOptions,
	): Promise<boolean>
}
