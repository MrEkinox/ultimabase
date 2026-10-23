// What every query of a model shares (D-18): the running application, the
// caller and the scope it reads through, and the shape it returns.
import type { Access } from './access.ts'
import { and } from './access.ts'
import type { Filter, Row } from './adapter.ts'
import { InvalidQuery } from './errors.ts'
import type { Caller } from './rules.ts'
import type { Running } from './running.ts'
import type { ModelInfo } from './schema.ts'
import type { QueryScope } from './scope.ts'
import { planned } from './scope.ts'
import type { Hidden, Shape } from './query-args.ts'
import { plan, project } from './query-args.ts'
import type { Models } from './query-where.ts'
import { entries, unknownKey } from './query-where.ts'

export type Context = {
	readonly app: Running
	readonly models: Models
	readonly model: ModelInfo
	readonly caller: Caller
	readonly scope: QueryScope
}

export function given(
	args: unknown,
	model: string,
	keys: readonly string[],
	required: readonly string[],
): Map<string, unknown> {
	const found = new Map(args === undefined ? [] : entries(args, 'args'))
	for (const key of found.keys()) {
		if (!keys.includes(key)) throw unknownKey(key, model)
	}
	for (const key of required) {
		if (!found.has(key)) throw new InvalidQuery(key, `${key} is required.`)
	}
	return found
}

/** `select` and `include` of a single-row operation. */
export function picked(found: ReadonlyMap<string, unknown>): object {
	const args: { [key: string]: unknown } = {}
	for (const key of ['select', 'include']) {
		if (found.has(key)) args[key] = found.get(key)
	}
	return args
}

/** The rows a many-row operation's `where` selects that the caller reads. */
export async function filtered(
	context: Context,
	found: ReadonlyMap<string, unknown>,
): Promise<Filter | undefined> {
	const { models, model, scope } = context
	const keys = new Set(['where'])
	const args = Object.fromEntries(found)
	return planned(scope, () =>
		and(
			plan(models, model, args, '', 'one', keys, scope).read.where,
			scope.readable(model.name),
		),
	)
}

export const byId = (id: string): Filter => ({ id: { equals: id } })

/** The fields the caller's field read rules hide (D-44). */
export function hiddenBy(access: Access | undefined): Hidden | undefined {
	return access && ((model, row, fields) => access.hidden(model, row, fields))
}

export function first(
	rows: readonly Row[],
	shape: Shape,
	access: Access | undefined,
): unknown {
	const [row] = rows
	return row === undefined ? null : project(row, shape, hiddenBy(access))
}
