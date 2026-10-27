// A test file's own tables on a database that keeps them (D-137): the
// adapter says how it gives them, and `testApplication` asks for them.
import type { Adapter } from './adapter.ts'

/**
 * The tables of one test file: until `drop`, each start of the adapter
 * finds them empty, and no other table is read or written.
 */
export type Scratch = {
	/** Drops them; the adapter's next start is on its own tables again. */
	readonly drop: () => Promise<void>
}

const scratches = new WeakMap<Adapter, () => Scratch>()

/** Remembers how `adapter` gives a test file its own tables. */
export function scratchable<T extends Adapter>(
	adapter: T,
	scratch: () => Scratch,
): T {
	scratches.set(adapter, scratch)
	return adapter
}

/** How `adapter` gives a test file its own tables, if it can. */
export function scratchOf(adapter: Adapter): (() => Scratch) | undefined {
	return scratches.get(adapter)
}
