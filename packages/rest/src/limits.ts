// The limits of a request of a caller other than Master (D-107): how deep it
// nests and, unless it is live (D-154), how many rows it may return.
import { badInput } from '@ultimabase/http/internal'
import type { Caller } from 'ultimabase'
import type { Api } from './entries.ts'
import type { Shape } from './fields.ts'
import { depthOf, rowsBelow } from './fields.ts'

/** Refuses a request above the limits; `rows` absent checks its depth only. */
export function bounded(
	api: Api,
	caller: Caller,
	shape: Shape,
	rows?: number,
): void {
	if (caller.kind === 'master') return
	const depth = depthOf(shape)
	if (depth > api.maxDepth) {
		throw badInput(
			`The request is nested ${depth} levels deep, its orderBy included; the most is ${api.maxDepth}.`,
		)
	}
	if (rows === undefined || rows + rowsBelow(shape, rows) <= api.maxRows) return
	const fewer = api.pagination === 'list' ? 'take' : 'first or last'
	throw badInput(
		`The request asks for more than ${api.maxRows.toLocaleString('en-US')} rows. Ask for fewer with ${fewer}.`,
	)
}
