// The filters one query reads through (D-71, D-86, D-88): the caller's read
// rules and the `beforeFind` of each model the query reaches, run once per
// operation (D-124).
import type { Access } from './access.ts'
import { and } from './access.ts'
import type { Filter } from './adapter.ts'
import { beforeFind } from './hooks.ts'
import type { FindOperation } from './model.ts'
import type { Caller } from './rules.ts'
import type { ModelInfo } from './schema.ts'
import type { Models, Scope } from './query-where.ts'

/**
 * `readable` is synchronous, as the planning that calls it, but `beforeFind`
 * may not be: a model read before its hook ran is recorded, and `ready` runs
 * the hooks so the query can be planned again with their filters.
 */
export class QueryScope implements Scope {
	/** By `operation name`, as `read Post`. */
	private readonly narrowed = new Map<string, Filter | undefined>()
	private readonly wanted = new Map<
		string,
		{ readonly name: string; readonly operation: FindOperation }
	>()
	readonly models: Models
	readonly caller: Caller
	/** `undefined` for Master, which skips access rules (D-48). */
	readonly access: Access | undefined

	constructor(models: Models, caller: Caller, access: Access | undefined) {
		this.models = models
		this.caller = caller
		this.access = access
	}

	check(
		model: ModelInfo,
		field: string,
		path: string,
		verb: 'filters' | 'sorts',
	): void {
		this.access?.check(model, field, path, verb)
	}

	/**
	 * The rows of `name` the query reads, or the write `operation` targets:
	 * its read rule and `beforeFind`.
	 */
	readable(
		name: string,
		operation: FindOperation = 'read',
	): Filter | undefined {
		return and(this.narrowing(name, operation), this.access?.readable(name))
	}

	/**
	 * Runs the `beforeFind` hooks of the models read since the last call;
	 * whether one of them narrows, so the query must be planned again.
	 */
	async ready(): Promise<boolean> {
		let narrowed = false
		for (const [key, { name, operation }] of this.wanted) {
			this.wanted.delete(key)
			const model = this.models.get(name)
			if (model === undefined) throw new Error(`Unknown model ${name}.`)
			const filter = await beforeFind(
				this.models,
				model,
				this.caller,
				operation,
			)
			this.narrowed.set(key, filter)
			if (filter !== undefined) narrowed = true
		}
		return narrowed
	}

	/**
	 * The rows of `name` a write reaches; `trusted` for a value a hook or a
	 * default wrote, which skips access rules but not `beforeFind` (D-67).
	 */
	async filter(
		name: string,
		trusted: boolean,
		operation: FindOperation = 'read',
	): Promise<Filter | undefined> {
		this.narrowing(name, operation)
		await this.ready()
		return trusted
			? this.narrowing(name, operation)
			: this.readable(name, operation)
	}

	private narrowing(
		name: string,
		operation: FindOperation,
	): Filter | undefined {
		const key = `${operation} ${name}`
		if (this.narrowed.has(key)) return this.narrowed.get(key)
		this.wanted.set(key, { name, operation })
		return undefined
	}
}

/** Plans a query, then again once the `beforeFind` hooks it reached ran. */
export async function planned<T>(
	scope: QueryScope,
	build: () => T,
): Promise<T> {
	let built = build()
	while (await scope.ready()) built = build()
	return built
}
