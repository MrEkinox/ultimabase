// The related rows a live read shows (D-154): by relation path then id, the
// window's rows that reach each one, so a write to it resends them.
import type { Row } from 'ultimabase'
import type { LivePlan } from 'ultimabase/internal'

type Shown = { readonly [field: string]: unknown }

/** The rows `include` reached from `node`, as `[path, id]`. */
function reached(
	node: Shown,
	include: LivePlan['include'],
	path: string,
	out: (readonly [string, string])[],
): void {
	for (const [name, inner] of Object.entries(include ?? {})) {
		const at = path === '' ? name : `${path}.${name}`
		const value = node[name]
		const rows: readonly unknown[] = Array.isArray(value) ? value : [value]
		for (const row of rows) {
			if (typeof row !== 'object' || row === null) continue
			const id: unknown = Reflect.get(row, 'id')
			if (typeof id === 'string') out.push([at, id])
			reached(Object.fromEntries(Object.entries(row)), inner.include, at, out)
		}
	}
}

export class Tracking {
	readonly tracked: Map<string, Map<string, Set<string>>> = new Map()
	readonly #reaching = new Map<string, readonly (readonly [string, string])[]>()

	clear(): void {
		this.tracked.clear()
		this.#reaching.clear()
	}

	/** Forgets the related rows the window's row `root` reached. */
	untrack(root: string): void {
		for (const [path, id] of this.#reaching.get(root) ?? []) {
			const roots = this.tracked.get(path)?.get(id)
			roots?.delete(root)
			if (roots?.size === 0) this.tracked.get(path)?.delete(id)
		}
		this.#reaching.delete(root)
	}

	/** Keeps the related rows `node`, as read through `include`, reaches. */
	track(node: Row, include: LivePlan['include']): void {
		const out: (readonly [string, string])[] = []
		reached(node, include, '', out)
		this.untrack(node.id)
		this.#reaching.set(node.id, out)
		for (const [path, id] of out) {
			const ids = this.tracked.get(path) ?? new Map<string, Set<string>>()
			this.tracked.set(path, ids)
			const roots = ids.get(id) ?? new Set<string>()
			ids.set(id, roots)
			roots.add(node.id)
		}
	}
}
