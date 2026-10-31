// A function's pages over REST (D-182): flat parameters for a page at the
// root, one JSON parameter named by its path for a page in a type, each
// read and bounded as the model's list route reads its own.
import type { Page } from '@ultimabase/http/internal'
import {
	badInput,
	connection,
	pageArgs,
	pageOf,
	rowsOf,
	run,
} from '@ultimabase/http/internal'
import type { Caller, ExposedOutput, Row } from 'ultimabase'
import { Refused } from 'ultimabase'
import { pageSource } from 'ultimabase/internal'
import type { Api, Args } from './entries.ts'
import { entryOf } from './entries.ts'
import { sizeOf, unknownKey } from './fields.ts'
import { bounded } from './limits.ts'
import type { Accepted } from './params.ts'
import { isArgs } from './values.ts'

/** A page of an output: '' at the root, `profile.posts` in a type. */
export type PageAt = { readonly path: string; readonly model: string }

/** The kernel page a request asks of a path, and whether it is counted. */
export type Paging = { readonly page: Page; readonly counted: boolean }

/** Each page `output` holds; none is under a list (D-182). */
export function pagesOf(
	output: ExposedOutput | undefined,
	path = '',
): readonly PageAt[] {
	if (output === undefined) return []
	if (output.kind === 'page') return [{ path, model: output.name }]
	if (output.kind !== 'type') return []
	return [...output.type.fields].flatMap(([name, field]) =>
		pagesOf(field, path === '' ? name : `${path}.${name}`),
	)
}

/** The keys a page takes: its arguments, and its count's unless a list. */
const keysOf = (api: Api): readonly string[] => [
	...pageArgs(api.pagination),
	...(api.pagination === 'connection' ? ['totalCount'] : []),
]

/** The query parameters of the pages, none named as an input's. */
export function pageParams(
	api: Api,
	owner: string,
	pages: readonly PageAt[],
	input: Accepted,
): Accepted {
	const cursors = ['after', 'before']
	const root = pages.some(({ path }) => path === '') ? keysOf(api) : []
	const params: Accepted = {
		json: [
			...root.filter((key) => !cursors.includes(key)),
			...pages.filter(({ path }) => path !== '').map(({ path }) => path),
		],
		text: root.filter((key) => cursors.includes(key)),
	}
	for (const name of [...params.json, ...params.text]) {
		if (input.json.includes(name) || input.text.includes(name)) {
			throw new Refused(
				`${owner}: its input property ${name} is a page parameter; rename it.`,
			)
		}
	}
	return params
}

/** The page of each path as `params` ask, all of them bounded together. */
export function pagingOf(
	api: Api,
	caller: Caller,
	pages: readonly PageAt[],
	params: Args,
): ReadonlyMap<string, Paging> {
	const keys = keysOf(api)
	const found = new Map<string, Paging>()
	let rows = 0
	for (const { path, model } of pages) {
		const at = (key: string): string => (path === '' ? key : `${path}.${key}`)
		const given = path === '' ? params : (params[path] ?? {})
		if (!isArgs(given)) throw badInput(`${path} must be an object.`)
		const args: { [key: string]: unknown } = {}
		for (const [key, value] of Object.entries(given)) {
			if (keys.includes(key)) args[key] = value
			else if (path !== '') throw unknownKey(at(key), model)
		}
		const { totalCount, ...asked } = args
		if (totalCount !== undefined && typeof totalCount !== 'boolean') {
			throw badInput(`${at('totalCount')} must be true or false.`)
		}
		const entry = entryOf(api, model)
		const master = caller.kind === 'master'
		const page = pageOf(api.pagination, entry, asked, master, at)
		const size = sizeOf(
			entry,
			api.pagination === 'list'
				? asked['take']
				: (asked['last'] ?? asked['first']),
		)
		// A count reads the rows it counts, however few the page returns.
		rows += totalCount === true ? Math.max(size, entry.take) : size
		found.set(path, { page, counted: totalCount === true })
	}
	bounded(api, caller, { fields: [] }, rows)
	return found
}

/** The page `value` holds, read as `paging` asks, each row as `node` gives. */
export async function readPage(
	model: string,
	value: unknown,
	paging: Paging,
	node: (row: Row) => unknown,
): Promise<unknown> {
	const source = pageSource(value, model)
	const { read, relay } = paging.page
	const rows = rowsOf(await run(async () => source.findMany(read)))
	if (relay === undefined) return rows.map(node)
	const page = connection(rows, relay, node)
	if (!paging.counted) return page
	return { ...page, totalCount: await run(async () => source.count()) }
}
