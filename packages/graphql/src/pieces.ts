// A big live window (D-272): graphql-js runs a selection without yielding, so
// each of its parts runs on its own turn of the loop, and the others wait for a
// part, not for the window.
import type { ExecutionResult } from 'graphql'

/** About 40 ms of graphql-js, at 20 µs a row. */
export const rowsAtOnce = 2000

/** A window's parts, and how their results make the window's. */
export type Pieces = {
	readonly roots: readonly unknown[]
	readonly merged: (results: readonly ExecutionResult[]) => ExecutionResult
}

/** `items` in parts of `rowsAtOnce`. */
export function cut<Item>(
	items: readonly Item[],
): readonly (readonly Item[])[] {
	const parts: (readonly Item[])[] = []
	for (let at = 0; at < items.length; at += rowsAtOnce) {
		parts.push(items.slice(at, at + rowsAtOnce))
	}
	return parts
}

/** The first result, its `field` of `holderOf` holding those of all `results`. */
export function joined(
	results: readonly ExecutionResult[],
	holderOf: (result: ExecutionResult) => unknown,
	field: string,
): ExecutionResult {
	const list: unknown[] = []
	for (const result of results) {
		const held: unknown = Reflect.get(Object(holderOf(result)), field)
		const part: readonly unknown[] = Array.isArray(held) ? held : []
		// Not `push(...part)`: a part is too long to spread on every stack.
		for (const item of part) list.push(item)
	}
	const [first = {}] = results
	Reflect.set(Object(holderOf(first)), field, list)
	return first
}

/**
 * Runs each of `pieces` on its own turn of the loop. An error's path counts
 * from its part, so a window with errors runs again whole.
 */
export async function ranInPieces(
	pieces: Pieces,
	run: (root: unknown) => ExecutionResult | Promise<ExecutionResult>,
	whole: () => ExecutionResult | Promise<ExecutionResult>,
): Promise<ExecutionResult> {
	const results: ExecutionResult[] = []
	for (const root of pieces.roots) {
		const result = await run(root)
		if (result.errors !== undefined) return whole()
		results.push(result)
		await new Promise((resume) => {
			setImmediate(resume)
		})
	}
	return pieces.merged(results)
}
