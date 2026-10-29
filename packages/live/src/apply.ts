// What a live list's message changes (D-154): rows placed by their id after
// another's, under a connection's edges or in a plain array of rows.

/** One change of a live list: a row gone from it, or placed after another. */
export type LiveChange =
	| { readonly remove: string; readonly gone?: boolean }
	| { readonly upsert: unknown; readonly after: string | null }

/** A live list's message: SSE's `live` event, GraphQL's `extensions.live`. */
export type LiveMessage = {
	readonly revision: number
	readonly changes?: readonly LiveChange[]
	readonly totalCount?: number
	readonly pageInfo?: unknown
}

/** A live list: a connection, or an array of rows. */
export type LiveList = readonly unknown[] | { readonly [key: string]: unknown }

const isRecord = (
	value: unknown,
): value is { readonly [key: string]: unknown } =>
	typeof value === 'object' && value !== null

const isRows = (list: LiveList): list is readonly unknown[] =>
	Array.isArray(list)

/** `row`'s id, the node's under a connection. */
function idOf(row: unknown, connected: boolean): string {
	const node = connected && isRecord(row) ? row['node'] : row
	const id = isRecord(node) ? node['id'] : undefined
	if (typeof id !== 'string') {
		throw new Error("Select the node's id to follow a live list.")
	}
	return id
}

/** `rows` changed by `changes`, or `undefined` if they name a row not in it. */
function placed(
	rows: readonly unknown[],
	changes: readonly LiveChange[],
	connected: boolean,
): unknown[] | undefined {
	const next = [...rows]
	const at = (id: string) =>
		next.findIndex((row) => idOf(row, connected) === id)
	for (const change of changes) {
		if ('remove' in change) {
			const index = at(change.remove)
			if (index < 0) return undefined
			next.splice(index, 1)
			continue
		}
		const index = at(idOf(change.upsert, connected))
		if (index >= 0) next.splice(index, 1)
		const after = change.after === null ? -1 : at(change.after)
		if (change.after !== null && after < 0) return undefined
		next.splice(after + 1, 0, change.upsert)
	}
	return next
}

/**
 * `list` changed by `message`, a new list; `undefined` when the message
 * names a row the list does not hold, which is out of step: read it again.
 * The caller applies messages in order, each revision one more than the last.
 */
export function applyLive<T extends LiveList>(
	list: T,
	message: LiveMessage,
): T | undefined {
	const changes = message.changes ?? []
	const read: LiveList = list
	if (isRows(read)) {
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an array of T's rows.
		return placed(read, changes, false) as T | undefined
	}
	const connection = read
	const next = { ...connection }
	const { edges } = connection
	if (Array.isArray(edges)) {
		const rows = placed(edges, changes, true)
		if (rows === undefined) return undefined
		next['edges'] = rows
	}
	if (message.pageInfo !== undefined) next['pageInfo'] = message.pageInfo
	if (message.totalCount !== undefined) next['totalCount'] = message.totalCount
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- T with its fields replaced.
	return next as T
}
